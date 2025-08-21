import { generateText } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
});
