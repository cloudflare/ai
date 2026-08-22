import { describe, expect, it, vi } from "vitest";
import { openai } from "../src/openai";

async function requestedUrl(modelId: string) {
	const fetch = vi.fn(async (input: RequestInfo | URL) => {
		throw new Error(String(input));
	});

	const model = openai.create({
		modelId,
		fetch: fetch as typeof globalThis.fetch,
	});

	await expect(model.doGenerate({ prompt: [] } as never)).rejects.toThrow();
	return String(fetch.mock.calls[0]?.[0]);
}

describe("openai provider plugin", () => {
	it("uses the Responses API for gpt-5.6 models", async () => {
		expect(await requestedUrl("gpt-5.6-luna")).toContain("/responses");
	});

	it("keeps Chat Completions for ordinary OpenAI models", async () => {
		expect(await requestedUrl("gpt-5.4-mini")).toContain("/chat/completions");
	});
});
