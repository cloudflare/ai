import { describe, expect, it, vi } from "vitest";
import { openai } from "../src/openai";

async function requestedUrl(modelId: string, baseURL?: string) {
	const fetch = vi.fn(async (input: RequestInfo | URL) => {
		throw new Error(String(input));
	});

	const model = openai.create({
		modelId,
		fetch: fetch as typeof globalThis.fetch,
		...(baseURL ? { baseURL } : {}),
	});

	await expect(model.doGenerate({ prompt: [] } as never)).rejects.toThrow();
	return String(fetch.mock.calls[0]?.[0]);
}

describe("openai provider plugin", () => {
	it("uses the Responses API for gpt-5.6 models", async () => {
		for (const modelId of ["gpt-5.6", "gpt-5.6-luna", "gpt-5.6-mini"]) {
			expect(await requestedUrl(modelId)).toContain("/responses");
		}
	});

	it("keeps Chat Completions for ordinary OpenAI models", async () => {
		for (const modelId of ["gpt-5.4-mini", "gpt-5.5"]) {
			expect(await requestedUrl(modelId)).toContain("/chat/completions");
		}
	});

	it("preserves the Responses endpoint when a Gateway base URL is configured", async () => {
		expect(await requestedUrl("gpt-5.6-luna", "https://gateway.example/v1")).toBe(
			"https://gateway.example/v1/responses",
		);
	});
});
