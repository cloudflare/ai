import type { LanguageModelV4 } from "@ai-sdk/provider";
import { generateText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { createWorkersAI } from "../src/index";
import type { ProviderPlugin } from "../src/gateway-delegate";
import { openai as openaiWirePlugin } from "../src/openai";

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
			specificationVersion: "v4",
			modelId,
			provider: "test.openai",
		}) as unknown as LanguageModelV4,
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

	it("passes `dynamic/...` ids through as Workers AI models when no OpenAI-wire plugin is configured", async () => {
		const run = vi.fn(async () => ({ response: "Hello from dynamic route" }));
		const binding = { run } as unknown as Parameters<typeof createWorkersAI>[0] extends {
			binding: infer B;
		}
			? B
			: never;
		const workersai = createWorkersAI({
			binding,
		});

		const result = await generateText({
			model: workersai("dynamic/gemma-4-fallback", { safePrompt: true }),
			prompt: "Say hello.",
		});

		expect(result.text).toBe("Hello from dynamic route");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBe("dynamic/gemma-4-fallback");
		expect(run.mock.calls[0][2]).toMatchObject({
			gateway: { id: "default" },
		});
	});

	it("uses the OpenAI-wire provider plugin for `dynamic/...` ids when configured", async () => {
		const run = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: "chatcmpl-test",
						object: "chat.completion",
						created: 0,
						model: "gpt-4o",
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									content: "Hello from OpenAI-wire dynamic route",
								},
								finish_reason: "stop",
							},
						],
						usage: {
							prompt_tokens: 4,
							completion_tokens: 6,
							total_tokens: 10,
						},
					}),
					{
						headers: {
							"content-type": "application/json",
							"cf-aig-cache-status": "MISS",
							"cf-aig-log-id": "log-123",
						},
					},
				),
		);
		const onDispatch = vi.fn();
		const binding = { run } as unknown as Parameters<typeof createWorkersAI>[0] extends {
			binding: infer B;
		}
			? B
			: never;
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiWirePlugin],
		});

		const result = await generateText({
			model: workersai("dynamic/gemma-4-fallback", {
				cacheTtl: 60,
				collectLog: true,
				metadata: { route: "gemma" },
				onDispatch,
				skipCache: true,
			}),
			prompt: "Say hello.",
		});

		expect(result.text).toBe("Hello from OpenAI-wire dynamic route");
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBe("dynamic/gemma-4-fallback");
		expect(run.mock.calls[0][1]).not.toHaveProperty("model");
		expect(run.mock.calls[0][2]).toMatchObject({
			gateway: {
				cacheTtl: 60,
				collectLog: true,
				id: "default",
				metadata: { route: "gemma" },
				skipCache: true,
			},
			returnRawResponse: true,
		});
		expect(onDispatch).toHaveBeenCalledWith(
			expect.objectContaining({
				cacheStatus: "MISS",
				logId: "log-123",
				resumeEnabled: false,
				transport: "run",
			}),
		);
	});

	it("throws for `dynamic/...` ids when providers are configured without the OpenAI-wire plugin", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [
				{
					wireFormat: "anthropic",
					create: openaiPlugin.create,
				},
			],
		});

		expect(() => workersai("dynamic/anty")).toThrow(/OpenAI-compatible/);
		expect(() => workersai("dynamic/anty")).toThrow(/workers-ai-provider\/openai/);
	});

	it("throws for unsupported delegate-only options on `dynamic/...` ids", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiWirePlugin],
		});

		expect(() =>
			workersai("dynamic/gemma-4-fallback", {
				fallback: { mode: "client", models: ["openai/gpt-5-mini"] },
			}),
		).toThrow(/gateway-delegate features/);
		expect(() => workersai("dynamic/gemma-4-fallback", { transport: "gateway" })).toThrow(
			/gateway-delegate features/,
		);
		expect(() => workersai("dynamic/gemma-4-fallback", { resume: true })).toThrow(
			/gateway-delegate features/,
		);
		// The dynamic-route message still names the dynamic route specifically.
		expect(() => workersai("dynamic/gemma-4-fallback", { resume: true })).toThrow(
			/is an AI Gateway dynamic route/,
		);
	});

	it("builds a plain Workers AI run model for a catalog slug when providers are NOT configured (#596)", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({ binding, gateway: { id: "default" } });
		// Without provider plugins there's no gateway/BYOK routing to do, so a bare
		// "<vendor>/<model>" id is treated as a Workers AI unified-billing run model
		// (env.AI.run) — matching pre-3.2 behavior — rather than throwing.
		const model = workersai("openai/gpt-5-mini");
		expect(model.modelId).toBe("openai/gpt-5-mini");
		expect(model.provider).toBe("workersai.chat");
	});

	it("treats `@cf/` ids as Workers AI even without providers (no routing)", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({ binding });
		const model = workersai("@cf/meta/llama-3.1-8b-instruct");
		expect(model.modelId).toBe("@cf/meta/llama-3.1-8b-instruct");
		expect(model.provider).toBe("workersai.chat");
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
		workersai("dynamic/gemma-4-fallback", {
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

// ---------------------------------------------------------------------------
// Regression: deepseek/deepseek-v4-pro unified-billing run path (#596)
//
// `deepseek/deepseek-v4-pro` is a unified-billing model on the `env.AI.run`
// catalog (verified live: 200). It *looks* like a `<provider>/<model>` catalog
// slug, so 3.2.x routed it to the BYOK gateway universal endpoint (401). It must
// default to the unified run path instead. (deepseek-chat, by contrast, is a
// recognized-but-BYOK deepseek model — 402 "use BYOK" — reachable via `byok`.)
// ---------------------------------------------------------------------------

describe("createWorkersAI — deepseek/deepseek-v4-pro run path (#596)", () => {
	it("without providers: builds a plain Workers AI run model (env.AI.run)", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({ binding, gateway: { id: "default" } });
		const model = workersai("deepseek/deepseek-v4-pro");
		// Passed straight through to env.AI.run — full slug preserved, no prefix strip.
		expect(model.modelId).toBe("deepseek/deepseek-v4-pro");
		expect(model.provider).toBe("workersai.chat");
	});

	it("with providers: dispatches through the unified run path, not the BYOK gateway", async () => {
		const run = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: "chatcmpl-ds",
						object: "chat.completion",
						created: 0,
						model: "deepseek-v4-pro",
						choices: [
							{
								index: 0,
								message: { role: "assistant", content: "Hello from deepseek" },
								finish_reason: "stop",
							},
						],
						usage: { prompt_tokens: 3, completion_tokens: 3, total_tokens: 6 },
					}),
					{ headers: { "content-type": "application/json", "cf-aig-log-id": "log-ds" } },
				),
		);
		const gatewayRun = vi.fn(async () => new Response("unused"));
		const binding = {
			run,
			gateway: vi.fn(() => ({ run: gatewayRun })),
		} as unknown as Parameters<typeof createWorkersAI>[0] extends { binding: infer B }
			? B
			: never;

		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiWirePlugin],
		});

		let dispatch: { transport?: string } | undefined;
		const result = await generateText({
			model: workersai("deepseek/deepseek-v4-pro", {
				onDispatch: (info) => {
					dispatch = info;
				},
			}),
			prompt: "Say hello.",
		});

		expect(result.text).toBe("Hello from deepseek");
		// Unified-billing run path: the FULL slug goes to env.AI.run …
		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBe("deepseek/deepseek-v4-pro");
		// … and NOT the BYOK gateway universal (chat/completions) endpoint.
		expect(gatewayRun).not.toHaveBeenCalled();
		expect(dispatch?.transport).toBe("run");
	});

	it("without providers: defaults the run to the account gateway for a catalog slug", async () => {
		// A bare "<vendor>/<model>" run model needs a gateway (third-party unified
		// billing routes through one). Even with no `gateway` configured, the run
		// path must default to "default" — otherwise env.AI.run gets no gateway and
		// unified billing never engages.
		const run = vi.fn(async () => ({ response: "hi from deepseek" }));
		const binding = { run } as unknown as Parameters<typeof createWorkersAI>[0] extends {
			binding: infer B;
		}
			? B
			: never;
		const workersai = createWorkersAI({ binding });

		await generateText({
			model: workersai("deepseek/deepseek-v4-pro"),
			prompt: "hi",
		});

		expect(run).toHaveBeenCalledTimes(1);
		expect(run.mock.calls[0][0]).toBe("deepseek/deepseek-v4-pro");
		expect(run.mock.calls[0][2]).toMatchObject({ gateway: { id: "default" } });
	});

	it("without providers: rejects delegate-only options instead of silently dropping them", () => {
		const { binding } = makeBinding();
		const workersai = createWorkersAI({ binding, gateway: { id: "default" } });
		// byok/transport/fallback/resume can't be honored on the bare run path — a
		// silent drop would send a BYOK request out on unified billing. Throw.
		expect(() => workersai("deepseek/deepseek-chat", { byok: true })).toThrow(
			/gateway-delegate features/,
		);
		expect(() => workersai("deepseek/deepseek-v4-pro", { transport: "gateway" })).toThrow(
			/no `providers` are configured/,
		);
		expect(() =>
			workersai("deepseek/deepseek-v4-pro", {
				fallback: { mode: "client", models: ["openai/gpt-4.1-mini"] },
			}),
		).toThrow(/gateway-delegate features/);
	});

	it("still allows explicit BYOK via the gateway path", () => {
		const { binding, gwCalls } = (() => {
			const gwCalls: unknown[] = [];
			const b = {
				run: vi.fn(async () => new Response("ok")),
				gateway: vi.fn(() => ({
					run: vi.fn(async (entries: unknown) => {
						gwCalls.push(entries);
						return new Response("ok");
					}),
				})),
			} as unknown as Parameters<typeof createWorkersAI>[0] extends { binding: infer B }
				? B
				: never;
			return { binding: b, gwCalls };
		})();

		const workersai = createWorkersAI({
			binding,
			gateway: { id: "default" },
			providers: [openaiWirePlugin],
		});
		// byok opts into the gateway path even though deepseek defaults to run.
		const model = workersai("deepseek/deepseek-chat", {
			byok: true,
			extraHeaders: { authorization: "Bearer real-key" },
		});
		expect(model.modelId).toBe("deepseek-chat");
		void gwCalls;
	});
});
