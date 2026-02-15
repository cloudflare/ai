import { describe, expect, it, vi } from "vitest";
import { createWorkersAI } from "../src/index";

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

describe("createWorkersAI config validation", () => {
	it("accepts a binding config", () => {
		const binding = {
			run: vi.fn().mockResolvedValue({ response: "ok" }),
		};
		const provider = createWorkersAI({ binding } as any);
		expect(provider).toBeDefined();
		expect(typeof provider).toBe("function");
	});

	it("accepts credentials config (accountId + apiKey)", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		expect(provider).toBeDefined();
		expect(typeof provider).toBe("function");
	});

	it("throws for empty config (no binding, no credentials)", () => {
		expect(() => createWorkersAI({} as any)).toThrow(/Invalid Workers AI configuration/);
	});

	it("throws for config with only accountId (missing apiKey)", () => {
		expect(() => createWorkersAI({ accountId: "abc" } as any)).toThrow(
			/Invalid Workers AI configuration/,
		);
	});

	it("throws for config with only apiKey (missing accountId)", () => {
		expect(() => createWorkersAI({ apiKey: "key" } as any)).toThrow(
			/Invalid Workers AI configuration/,
		);
	});

	it("throws for config with unrelated properties", () => {
		expect(() => createWorkersAI({ foo: "bar" } as any)).toThrow(
			/Invalid Workers AI configuration/,
		);
	});

	it("error message mentions binding and credentials", () => {
		try {
			createWorkersAI({} as any);
		} catch (e) {
			expect((e as Error).message).toContain("binding");
			expect((e as Error).message).toContain("credentials");
		}
	});
});

// ---------------------------------------------------------------------------
// Arbitrary model strings (string & {} widening)
// ---------------------------------------------------------------------------

describe("createWorkersAI model type flexibility", () => {
	it("accepts a known model name", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		const model = provider("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
		expect(model).toBeDefined();
		expect(model.modelId).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
	});

	it("accepts an arbitrary (non-listed) model string for chat", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		const model = provider("@cf/my-org/custom-model-v1");
		expect(model).toBeDefined();
		expect(model.modelId).toBe("@cf/my-org/custom-model-v1");
	});

	it("accepts an arbitrary model string for provider.chat()", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		const model = provider.chat("@cf/my-org/custom-chat-model");
		expect(model).toBeDefined();
		expect(model.modelId).toBe("@cf/my-org/custom-chat-model");
	});

	it("accepts an arbitrary model string for provider.image()", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		const model = provider.image("@cf/my-org/custom-image-model");
		expect(model).toBeDefined();
		expect(model.modelId).toBe("@cf/my-org/custom-image-model");
	});

	it("accepts an arbitrary model string for provider.embedding()", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		const model = provider.embedding("@cf/my-org/custom-embedding-model");
		expect(model).toBeDefined();
		expect(model.modelId).toBe("@cf/my-org/custom-embedding-model");
	});

	it("accepts an arbitrary model string for provider.transcription()", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		const model = provider.transcription("@cf/my-org/custom-whisper");
		expect(model).toBeDefined();
		expect(model.modelId).toBe("@cf/my-org/custom-whisper");
	});

	it("accepts an arbitrary model string for provider.speech()", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		const model = provider.speech("@cf/my-org/custom-tts");
		expect(model).toBeDefined();
		expect(model.modelId).toBe("@cf/my-org/custom-tts");
	});

	it("accepts an arbitrary model string for provider.reranking()", () => {
		const provider = createWorkersAI({
			accountId: "test-account",
			apiKey: "test-key",
		});
		const model = provider.reranking("@cf/my-org/custom-reranker");
		expect(model).toBeDefined();
		expect(model.modelId).toBe("@cf/my-org/custom-reranker");
	});
});
