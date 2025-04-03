import { generateText } from "ai";
import { http, HttpResponse } from "msw";
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
			apiKey: TEST_API_KEY,
			accountId: TEST_ACCOUNT_ID,
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
			apiKey: TEST_API_KEY,
			accountId: TEST_ACCOUNT_ID,
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
			aString: "a",
			aBool: true,
			aNumber: 1,
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
			apiKey: TEST_API_KEY,
			accountId: TEST_ACCOUNT_ID,
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
				run: async (modelName: string, inputs: any, options?: any) => {
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
				run: async (modelName: string, inputs: any, options?: any) => {
					capturedOptions = options;
					return { response: "Hello" };
				},
			},
		});

		const model = workersai(TEST_MODEL, {
			aString: "a",
			aBool: true,
			aNumber: 1,
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
});
