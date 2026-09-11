import { createDeepSeek } from "../src/providers/deepseek";
import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiGateway } from "../src";

/**
 * Regression for https://github.com/cloudflare/ai/issues/620
 *
 * Concurrent calls on a shared gateway-wrapped model must not cross-wire
 * request bodies / responses via a mutated shared `model.config.fetch`.
 */
describe("Concurrent request isolation", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("keeps concurrent generateText calls isolated on a shared model", async () => {
		const gatewayBodies: unknown[] = [];

		globalThis.fetch = (async (_url, init) => {
			const body = JSON.parse(String(init?.body ?? "null"));
			const prompts = Array.isArray(body)
				? body.map(
						(request: { query?: { messages?: { content?: string }[] } }) =>
							request.query?.messages?.at(-1)?.content,
					)
				: [];
			gatewayBodies.push(prompts);

			const prompt = prompts[0];
			return new Response(
				JSON.stringify({
					id: "id",
					object: "chat.completion",
					created: 0,
					model: "deepseek-chat",
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: `ANSWER:${prompt}` },
							finish_reason: "stop",
						},
					],
					usage: {
						prompt_tokens: 1,
						completion_tokens: 1,
						total_tokens: 2,
					},
				}),
				{
					headers: {
						"content-type": "application/json",
						"cf-aig-step": "0",
					},
				},
			);
		}) as typeof fetch;

		const gateway = createAiGateway({
			accountId: "test",
			gateway: "test",
			apiKey: "test",
		});
		const deepseek = createDeepSeek();
		const model = gateway(deepseek("deepseek-chat"));

		const ask = (prompt: string) =>
			generateText({ model, prompt, maxRetries: 0 }).then((result) => result.text);

		const [a, b] = await Promise.all([ask("A"), ask("B")]);

		expect(a).toBe("ANSWER:A");
		expect(b).toBe("ANSWER:B");
		expect(gatewayBodies).toHaveLength(2);
		expect(gatewayBodies).toEqual(expect.arrayContaining([["A"], ["B"]]));
	});
});
