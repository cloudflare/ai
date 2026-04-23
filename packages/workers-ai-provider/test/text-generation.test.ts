import { generateText } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { createWorkersAI } from "../src/index";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const textGenerationHandler = http.post(
	`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
	async () => {
		return HttpResponse.json({ result: { response: "Hello" } });
	},
);

const server = setupServer(textGenerationHandler);

describe("REST API - Text Generation Tests", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should generate text (non-streaming)", async () => {
		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});
		const result = await generateText({
			model: workersai(TEST_MODEL),
			prompt: "Write a greeting",
		});
		expect(result.text).toBe("Hello");
	});

	it("should pass through additional options to the query string", async () => {
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async ({ request }) => {
					// get passthrough params from url query
					const url = new URL(request.url);
					capturedOptions = Object.fromEntries(url.searchParams.entries());

					return HttpResponse.json({ result: { response: "Hello" } });
				},
			),
		);

		const model = workersai(TEST_MODEL, {
			aBool: true,
			aNumber: 1,
			aString: "a",
		});

		const result = await generateText({
			model: model,
			prompt: "Write a greetings",
		});

		expect(result.text).toBe("Hello");
		expect(capturedOptions).toHaveProperty("aString", "a");
		expect(capturedOptions).toHaveProperty("aBool", "true");
		expect(capturedOptions).toHaveProperty("aNumber", "1");
	});

	it("should send x-session-affinity header when sessionAffinity is set", async () => {
		let capturedHeaders: Record<string, string> = {};

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async ({ request }) => {
					capturedHeaders = Object.fromEntries(request.headers.entries());
					return HttpResponse.json({ result: { response: "Hello" } });
				},
			),
		);

		const model = workersai(TEST_MODEL, {
			sessionAffinity: "session-123",
		});

		const result = await generateText({
			model: model,
			prompt: "Write a greeting",
		});

		expect(result.text).toBe("Hello");
		expect(capturedHeaders["x-session-affinity"]).toBe("session-123");
	});

	it("should merge sessionAffinity with user-provided extraHeaders", async () => {
		let capturedHeaders: Record<string, string> = {};

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async ({ request }) => {
					capturedHeaders = Object.fromEntries(request.headers.entries());
					return HttpResponse.json({ result: { response: "Hello" } });
				},
			),
		);

		const model = workersai(TEST_MODEL, {
			sessionAffinity: "session-123",
			extraHeaders: { "x-custom-trace": "trace-abc" },
		});

		const result = await generateText({
			model: model,
			prompt: "Write a greeting",
		});

		expect(result.text).toBe("Hello");
		expect(capturedHeaders["x-session-affinity"]).toBe("session-123");
		expect(capturedHeaders["x-custom-trace"]).toBe("trace-abc");
	});

	it("should not send x-session-affinity header when sessionAffinity is not set", async () => {
		let capturedHeaders: Record<string, string> = {};

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async ({ request }) => {
					capturedHeaders = Object.fromEntries(request.headers.entries());
					return HttpResponse.json({ result: { response: "Hello" } });
				},
			),
		);

		const result = await generateText({
			model: workersai(TEST_MODEL),
			prompt: "Write a greeting",
		});

		expect(result.text).toBe("Hello");
		expect(capturedHeaders["x-session-affinity"]).toBeUndefined();
	});

	it("should throw if passthrough option cannot be coerced into a string", async () => {
		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		await expect(
			generateText({
				model: workersai(TEST_MODEL, {
					// @ts-expect-error
					notDefined: undefined,
				}),
				prompt: "Write a greetings",
			}),
		).rejects.toThrowError(
			"Value for option 'notDefined' is not able to be coerced into a string.",
		);

		await expect(
			generateText({
				model: workersai(TEST_MODEL, {
					// @ts-expect-error
					isNull: null,
				}),
				prompt: "Write a greetings",
			}),
		).rejects.toThrowError(
			"Value for option 'isNull' is not able to be coerced into a string.",
		);
	});
	it("should throw on 401 Unauthorized", async () => {
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async () => {
					return HttpResponse.json(
						{ success: false, errors: [{ message: "Unauthorized" }] },
						{ status: 401 },
					);
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: "bad-key",
		});

		await expect(
			generateText({
				model: workersai(TEST_MODEL),
				prompt: "Hello",
			}),
		).rejects.toThrowError("Workers AI API error (401");
	});

	it("should throw on 404 Not Found for invalid model", async () => {
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async () => {
					return HttpResponse.json(
						{ success: false, errors: [{ message: "No route for that URI" }] },
						{ status: 404 },
					);
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		await expect(
			generateText({
				model: workersai(TEST_MODEL),
				prompt: "Hello",
			}),
		).rejects.toThrowError("Workers AI API error (404");
	});

	it("should throw on 500 Internal Server Error", async () => {
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async () => {
					return new Response("Internal Server Error", { status: 500 });
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		await expect(
			generateText({
				model: workersai(TEST_MODEL),
				prompt: "Hello",
			}),
		).rejects.toThrowError("Workers AI API error (500");
	});
});

describe("Binding - Text Generation Tests", () => {
	it("should generate text (non-streaming)", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, _options?: any) => {
					return { response: "Hello" };
				},
			},
		});

		const result = await generateText({
			model: workersai(TEST_MODEL),
			prompt: "Write a greeting",
		});

		expect(result.text).toBe("Hello");
	});

	it("should pass through additional options to the AI run method in the mock", async () => {
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, options?: any) => {
					capturedOptions = options;
					return { response: "Hello" };
				},
			},
		});

		const model = workersai(TEST_MODEL, {
			aBool: true,
			aNumber: 1,
			aString: "a",
		});

		const result = await generateText({
			model: model,
			prompt: "Write a greetings",
		});

		expect(result.text).toBe("Hello");
		expect(capturedOptions).toHaveProperty("aString", "a");
		expect(capturedOptions).toHaveProperty("aBool", true);
		expect(capturedOptions).toHaveProperty("aNumber", 1);
	});

	it("should pass extraHeaders with x-session-affinity when sessionAffinity is set", async () => {
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, options?: any) => {
					capturedOptions = options;
					return { response: "Hello" };
				},
			},
		});

		const model = workersai(TEST_MODEL, {
			sessionAffinity: "session-456",
		});

		const result = await generateText({
			model: model,
			prompt: "Write a greeting",
		});

		expect(result.text).toBe("Hello");
		expect(capturedOptions).toHaveProperty("extraHeaders");
		expect(capturedOptions.extraHeaders).toEqual({ "x-session-affinity": "session-456" });
	});

	it("should merge sessionAffinity with user-provided extraHeaders", async () => {
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, options?: any) => {
					capturedOptions = options;
					return { response: "Hello" };
				},
			},
		});

		const model = workersai(TEST_MODEL, {
			sessionAffinity: "session-456",
			extraHeaders: { "x-custom-trace": "trace-xyz" },
		});

		const result = await generateText({
			model: model,
			prompt: "Write a greeting",
		});

		expect(result.text).toBe("Hello");
		expect(capturedOptions.extraHeaders).toEqual({
			"x-custom-trace": "trace-xyz",
			"x-session-affinity": "session-456",
		});
	});

	it("should not pass extraHeaders when sessionAffinity is not set", async () => {
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, options?: any) => {
					capturedOptions = options;
					return { response: "Hello" };
				},
			},
		});

		const result = await generateText({
			model: workersai(TEST_MODEL),
			prompt: "Write a greeting",
		});

		expect(result.text).toBe("Hello");
		expect(capturedOptions).not.toHaveProperty("extraHeaders");
	});

	it("should pass tool_choice to binding.run()", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, _options?: any) => {
					capturedInputs = inputs;
					return {
						response: null,
						tool_calls: [{ name: "get_weather", arguments: '{"city":"SF"}' }],
					};
				},
			},
		});

		await generateText({
			model: workersai(TEST_MODEL),
			prompt: "What's the weather?",
			tools: {
				get_weather: {
					description: "Get weather",
					inputSchema: z.object({ city: z.string() }),
				},
			},
			toolChoice: "auto",
		});

		expect(capturedInputs).toHaveProperty("tool_choice", "auto");
	});

	it("should map toolChoice 'required' to tool_choice 'required'", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, _options?: any) => {
					capturedInputs = inputs;
					return {
						response: null,
						tool_calls: [{ name: "draw_shape", arguments: '{"shape":"circle"}' }],
					};
				},
			},
		});

		await generateText({
			model: workersai(TEST_MODEL),
			prompt: "Draw a circle",
			tools: {
				draw_shape: {
					description: "Draw a shape",
					inputSchema: z.object({ shape: z.string() }),
				},
			},
			toolChoice: "required",
		});

		expect(capturedInputs).toHaveProperty("tool_choice", "required");
	});

	it("should handle content and reasoning_content", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, _options?: any) => {
					return {
						id: "chatcmpl-ef1d02dcbb6e4cf89f0dddaf2e2ff0a6",
						object: "chat.completion",
						created: 1751560708,
						model: TEST_MODEL,
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									reasoning_content: "Okay, the user is asking",
									content: "A **cow** is a domesticated, herbivorous mammal",
									tool_calls: [],
								},
								logprobs: null,
								finish_reason: "stop",
								stop_reason: null,
							},
						],
						usage: {
							prompt_tokens: 1,
							completion_tokens: 2,
							total_tokens: 3,
						},
						prompt_logprobs: null,
					};
				},
			},
		});

		const model = workersai(TEST_MODEL);

		const result = await generateText({
			model: model,
			messages: [
				{
					role: "user",
					content: "what is a cow?",
				},
			],
		});

		expect(result.reasoningText).toBe("Okay, the user is asking");
		expect(result.text).toBe("A **cow** is a domesticated, herbivorous mammal");
	});

	it("should handle reasoning field (without _content suffix)", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, _options?: any) => {
					return {
						id: "chatcmpl-r3",
						object: "chat.completion",
						created: 1751560708,
						model: TEST_MODEL,
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									reasoning: "Let me think step by step",
									content: "The answer is 42",
									tool_calls: [],
								},
								logprobs: null,
								finish_reason: "stop",
								stop_reason: null,
							},
						],
						usage: {
							prompt_tokens: 1,
							completion_tokens: 2,
							total_tokens: 3,
						},
					};
				},
			},
		});

		const model = workersai(TEST_MODEL);

		const result = await generateText({
			model: model,
			messages: [
				{
					role: "user",
					content: "what is the meaning of life?",
				},
			],
		});

		expect(result.reasoningText).toBe("Let me think step by step");
		expect(result.text).toBe("The answer is 42");
	});

	// ---------------------------------------------------------------------
	// Reasoning passthrough — reasoning_effort + chat_template_kwargs
	// https://github.com/cloudflare/ai/issues/501
	// ---------------------------------------------------------------------

	it("should forward settings.reasoning_effort on inputs (2nd arg), not options", async () => {
		let capturedInputs: any = null;
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, options?: any) => {
					capturedInputs = inputs;
					capturedOptions = options;
					return { response: "ok" };
				},
			},
		});

		const model = workersai("@cf/zai-org/glm-4.7-flash", {
			reasoning_effort: "low",
		});

		await generateText({ model, prompt: "Hi" });

		// Must land on inputs (2nd arg)
		expect(capturedInputs).toHaveProperty("reasoning_effort", "low");
		// Must NOT leak into options (3rd arg) — the exact bug in #501
		expect(capturedOptions).not.toHaveProperty("reasoning_effort");
	});

	it("should forward settings.chat_template_kwargs on inputs, not options", async () => {
		let capturedInputs: any = null;
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, options?: any) => {
					capturedInputs = inputs;
					capturedOptions = options;
					return { response: "ok" };
				},
			},
		});

		const model = workersai("@cf/zai-org/glm-4.7-flash", {
			chat_template_kwargs: { enable_thinking: false },
		});

		await generateText({ model, prompt: "Hi" });

		expect(capturedInputs.chat_template_kwargs).toEqual({ enable_thinking: false });
		expect(capturedOptions).not.toHaveProperty("chat_template_kwargs");
	});

	it("should preserve reasoning_effort: null (disables reasoning)", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, _options?: any) => {
					capturedInputs = inputs;
					return { response: "ok" };
				},
			},
		});

		const model = workersai("@cf/zai-org/glm-4.7-flash", {
			reasoning_effort: null,
		});

		await generateText({ model, prompt: "Hi" });

		// null is the explicit "no reasoning" signal — must be preserved on inputs
		expect(capturedInputs).toHaveProperty("reasoning_effort");
		expect(capturedInputs.reasoning_effort).toBeNull();
	});

	it("should not set reasoning fields when omitted", async () => {
		let capturedInputs: any = null;
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, options?: any) => {
					capturedInputs = inputs;
					capturedOptions = options;
					return { response: "ok" };
				},
			},
		});

		await generateText({ model: workersai(TEST_MODEL), prompt: "Hi" });

		expect(capturedInputs).not.toHaveProperty("reasoning_effort");
		expect(capturedInputs).not.toHaveProperty("chat_template_kwargs");
		expect(capturedOptions).not.toHaveProperty("reasoning_effort");
		expect(capturedOptions).not.toHaveProperty("chat_template_kwargs");
	});

	it("should allow per-call providerOptions['workers-ai'] to override settings", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, _options?: any) => {
					capturedInputs = inputs;
					return { response: "ok" };
				},
			},
		});

		const model = workersai("@cf/zai-org/glm-4.7-flash", {
			reasoning_effort: "high",
		});

		await generateText({
			model,
			prompt: "Hi",
			providerOptions: {
				"workers-ai": { reasoning_effort: "low" },
			},
		});

		// Per-call wins over settings
		expect(capturedInputs.reasoning_effort).toBe("low");
	});

	it("should allow per-call null to override a non-null settings value", async () => {
		// The `in` operator is what enables this: an explicit key in per-call
		// overrides settings even when the per-call value is null.
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, _options?: any) => {
					capturedInputs = inputs;
					return { response: "ok" };
				},
			},
		});

		const model = workersai("@cf/zai-org/glm-4.7-flash", {
			reasoning_effort: "high",
		});

		await generateText({
			model,
			prompt: "Hi",
			providerOptions: {
				"workers-ai": { reasoning_effort: null },
			},
		});

		expect(capturedInputs).toHaveProperty("reasoning_effort");
		expect(capturedInputs.reasoning_effort).toBeNull();
	});

	it("should ignore providerOptions['workers-ai'] when not a plain object", async () => {
		// Guard against runtime misuse — AI SDK types say JSONObject, but users
		// can bypass with `as any`. `"key" in primitive` throws, so we fall back
		// to settings instead of crashing.
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, _options?: any) => {
					capturedInputs = inputs;
					return { response: "ok" };
				},
			},
		});

		const model = workersai("@cf/zai-org/glm-4.7-flash", {
			reasoning_effort: "medium",
		});

		await generateText({
			model,
			prompt: "Hi",
			providerOptions: {
				// Intentionally wrong shape — string/array/null should be ignored
				"workers-ai": "not-an-object" as any,
			},
		});

		// Falls back to settings
		expect(capturedInputs.reasoning_effort).toBe("medium");
	});

	it("should combine reasoning params with AI Gateway on the binding path", async () => {
		// Reasoning params must land on inputs (2nd arg); gateway config stays on
		// options (3rd arg). They should not interfere with each other.
		let capturedInputs: any = null;
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, options?: any) => {
					capturedInputs = inputs;
					capturedOptions = options;
					return { response: "ok" };
				},
			},
			gateway: { id: "my-gw" },
		});

		const model = workersai("@cf/zai-org/glm-4.7-flash", {
			reasoning_effort: "low",
		});

		await generateText({ model, prompt: "Hi" });

		expect(capturedInputs.reasoning_effort).toBe("low");
		expect(capturedOptions.gateway).toEqual({ id: "my-gw" });
		// And crucially: the gateway shouldn't pick up reasoning_effort
		expect(capturedOptions).not.toHaveProperty("reasoning_effort");
	});

	it("should forward reasoning params on streaming requests too", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, inputs: any, _options?: any) => {
					capturedInputs = inputs;
					// Return a simple complete (non-streaming) response; the provider
					// wraps it as a synthetic stream via graceful degradation.
					return { response: "ok" };
				},
			},
		});

		const model = workersai("@cf/zai-org/glm-4.7-flash", {
			reasoning_effort: "medium",
			chat_template_kwargs: { enable_thinking: true },
		});

		const { streamText } = await import("ai");
		const { textStream } = streamText({ model, prompt: "Hi" });
		// Consume the stream so doStream actually runs
		for await (const _ of textStream) {
			// drain
		}

		expect(capturedInputs.stream).toBe(true);
		expect(capturedInputs.reasoning_effort).toBe("medium");
		expect(capturedInputs.chat_template_kwargs).toEqual({ enable_thinking: true });
	});
});

// ---------------------------------------------------------------------------
// REST mode — reasoning passthrough lands in JSON body (not URL query)
// https://github.com/cloudflare/ai/issues/501
// ---------------------------------------------------------------------------

describe("REST - reasoning passthrough", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	const REASONING_MODEL = "@cf/zai-org/glm-4.7-flash";

	it("should put reasoning_effort in the JSON body, not the URL query string", async () => {
		let capturedBody: any = null;
		let capturedQuery: Record<string, string> = {};

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${REASONING_MODEL}`,
				async ({ request }) => {
					const url = new URL(request.url);
					capturedQuery = Object.fromEntries(url.searchParams.entries());
					capturedBody = await request.json();
					return HttpResponse.json({ result: { response: "ok" } });
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const model = workersai(REASONING_MODEL, {
			reasoning_effort: "low",
			chat_template_kwargs: { enable_thinking: false },
		});

		await generateText({ model, prompt: "Hi" });

		// Both fields must be on the JSON body (inputs), not the URL query string
		expect(capturedBody.reasoning_effort).toBe("low");
		expect(capturedBody.chat_template_kwargs).toEqual({ enable_thinking: false });
		expect(capturedQuery).not.toHaveProperty("reasoning_effort");
		expect(capturedQuery).not.toHaveProperty("chat_template_kwargs");
	});

	it("should preserve reasoning_effort: null in the REST body", async () => {
		let capturedBody: any = null;

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${REASONING_MODEL}`,
				async ({ request }) => {
					capturedBody = await request.json();
					return HttpResponse.json({ result: { response: "ok" } });
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const model = workersai(REASONING_MODEL, {
			reasoning_effort: null,
		});

		await generateText({ model, prompt: "Hi" });

		// null is explicitly meaningful — must round-trip
		expect(capturedBody).toHaveProperty("reasoning_effort");
		expect(capturedBody.reasoning_effort).toBeNull();
	});

	it("should NOT throw when reasoning_effort is null in settings (REST regression)", async () => {
		// Before this fix, `createRun` would throw because it can't coerce
		// `null` into a URL query-string value. Now that reasoning_effort is
		// moved to the JSON body, this round-trips cleanly.
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${REASONING_MODEL}`,
				async () => HttpResponse.json({ result: { response: "ok" } }),
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const model = workersai(REASONING_MODEL, {
			reasoning_effort: null,
		});

		await expect(generateText({ model, prompt: "Hi" })).resolves.toBeDefined();
	});

	it("should still passthrough unrelated settings as URL query (no regression)", async () => {
		let capturedQuery: Record<string, string> = {};

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${REASONING_MODEL}`,
				async ({ request }) => {
					const url = new URL(request.url);
					capturedQuery = Object.fromEntries(url.searchParams.entries());
					return HttpResponse.json({ result: { response: "ok" } });
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const model = workersai(REASONING_MODEL, {
			// Other custom settings should continue flowing through as URL query
			custom_flag: "yes",
			reasoning_effort: "low",
		});

		await generateText({ model, prompt: "Hi" });

		expect(capturedQuery).toHaveProperty("custom_flag", "yes");
		expect(capturedQuery).not.toHaveProperty("reasoning_effort");
	});
});
