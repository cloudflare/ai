import type { LanguageModelV3 } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { createWorkersAI } from "../src/index";
import type { ProviderPlugin } from "../src/gateway-delegate";

/** Minimal binding that records run/gateway calls. */
function makeBinding() {
	const runCalls: Array<{ model: string }> = [];
	const binding = {
		run: vi.fn(async (model: string) => {
			runCalls.push({ model });
			return new Response("ok", { headers: { "cf-aig-run-id": "run-123" } });
		}),
		gateway: vi.fn(() => ({
			run: vi.fn(async () => new Response("ok", { headers: { "cf-aig-log-id": "log-1" } })),
		})),
	} as unknown as Parameters<typeof createWorkersAI>[0] extends { binding: infer B } ? B : never;
	return { binding, runCalls };
}

/** A plugin that builds a trivial model so we can assert routing happened. */
const openaiPlugin: ProviderPlugin = {
	wireFormat: "openai",
	create: ({ modelId }) =>
		({
			specificationVersion: "v3",
			modelId,
			provider: "test.openai",
		}) as unknown as LanguageModelV3,
};

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

// ---------------------------------------------------------------------------
// Implicit gateway-delegate routing (third-party catalog slugs)
// ---------------------------------------------------------------------------

describe("createWorkersAI implicit gateway routing", () => {
	it("routes a `<provider>/<model>` slug through the delegate when providers are configured", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiPlugin],
		});
		// The delegate strips the resolver key, so the built model id is "gpt-5-mini".
		const model = workersai("openai/gpt-5-mini");
		expect(model.modelId).toBe("gpt-5-mini");
		expect(model.provider).toBe("test.openai");
	});

	it('routes catalog slugs even when no gateway is configured (defaults to "default")', () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({
			binding,
			providers: [openaiPlugin],
		});
		const model = workersai("openai/gpt-5-mini");
		expect(model.modelId).toBe("gpt-5-mini");
		expect(model.provider).toBe("test.openai");
	});

	it("routes via provider.chat() too", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiPlugin],
		});
		expect(workersai.chat("openai/gpt-5-mini").modelId).toBe("gpt-5-mini");
	});

	it("still builds Workers AI models for `@cf/...` ids when providers are configured", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiPlugin],
		});
		const model = workersai("@cf/meta/llama-3.1-8b-instruct");
		expect(model.modelId).toBe("@cf/meta/llama-3.1-8b-instruct");
		expect(model.provider).toBe("workersai.chat");
	});

	it("throws a helpful error for a catalog slug when providers are NOT configured", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({ binding, gateway: { id: "default" } });
		expect(() => workersai("openai/gpt-5-mini")).toThrow(
			/third-party AI Gateway catalog model/,
		);
		expect(() => workersai("openai/gpt-5-mini")).toThrow(/workers-ai-provider\/openai/);
	});

	it("treats `@cf/` ids as Workers AI even without providers (no routing)", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({ binding });
		const model = workersai("@cf/meta/llama-3.1-8b-instruct");
		expect(model.modelId).toBe("@cf/meta/llama-3.1-8b-instruct");
		expect(model.provider).toBe("workersai.chat");
	});

	it("treats `dynamic/<model>` slugs as Workers AI model ids (not catalog slugs)", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({ binding, gateway: { id: "default" } });
		const model = workersai("dynamic/gemma-4-fallback");
		expect(model.modelId).toBe("dynamic/gemma-4-fallback");
		expect(model.provider).toBe("workersai.chat");
	});

	it("routes `dynamic/<model>` slugs to Workers AI even when providers are configured", () => {
		const { binding, runCalls } = makeBinding();
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiPlugin],
		});
		const model = workersai("dynamic/gemma-4-fallback");
		expect(model.modelId).toBe("dynamic/gemma-4-fallback");
		expect(model.provider).toBe("workersai.chat");
		// `.chat()` routes the same way.
		expect(workersai.chat("dynamic/gemma-4-fallback").provider).toBe("workersai.chat");
	});

	it("builds the delegate lazily (only on first catalog slug)", () => {
		const { binding } = makeBinding();
		const createSpy = vi.spyOn(openaiPlugin, "create");
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiPlugin],
		});
		// No delegate work for Workers AI ids.
		workersai("@cf/meta/llama-3.1-8b-instruct");
		expect(createSpy).not.toHaveBeenCalled();
		// First catalog slug triggers a plugin build.
		workersai("openai/gpt-5-mini");
		expect(createSpy).toHaveBeenCalledTimes(1);
		createSpy.mockRestore();
	});

	// Compile-time only: these assertions are validated by `tsc --noEmit`
	// (the test files are type-checked), proving the per-model settings type
	// resolves from the model id literal.
	it("narrows the settings type from the model id literal (type-level)", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiPlugin],
		});

		// `@cf/...` id → WorkersAIChatSettings autocompletes.
		workersai("@cf/zai-org/glm-4.7-flash", {
			safePrompt: true,
			reasoning_effort: "low",
		});

		// `<provider>/<model>` slug → DelegateCallOptions autocompletes.
		// (Each call uses a runtime-valid combination of options.)
		workersai("openai/gpt-5-mini", { resume: true, metadata: { tenant: "acme" } });
		workersai("openai/gpt-5-mini", { cacheTtl: 60 });
		workersai("openai/gpt-5-mini", {
			fallback: { mode: "client", models: ["openai/gpt-5"] },
		});

		// A catalog slug must reject chat-only settings (DelegateCallOptions has
		// no `safePrompt` and no index signature).
		// @ts-expect-error - `safePrompt` is not a DelegateCallOption
		workersai("openai/gpt-5-mini", { safePrompt: true });

		// `.chat` narrows the same way.
		workersai.chat("openai/gpt-5-mini", { resume: false });

		expect(true).toBe(true);
	});
});
