import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAiGateway } from "../src";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_GATEWAY = "my-gateway";

const textGenerationHandler = http.post(
	`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
	async () => {
		return HttpResponse.json({
			id: "chatcmpl-test123",
			created_at: Math.floor(Date.now() / 1000),
			model: "gpt-4o-mini",
			output: [
				{
					type: "message",
					role: "assistant",
					id: "msg-test123",
					content: [
						{
							type: "output_text",
							text: "Hello",
							annotations: [],
						},
					],
				},
			],
			incomplete_details: null,
			object: "response",
			usage: {
				input_tokens: 10,
				output_tokens: 1,
				total_tokens: 11,
			},
		});
	},
);

const server = setupServer(textGenerationHandler);

describe("Text Generation Tests", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should generate text (non-streaming)", async () => {
		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = await generateText({
			model: aigateway([openai("gpt-4o-mini")]),
			prompt: "Write a greeting",
		});
		expect(result.text).toBe("Hello");
	});
});
