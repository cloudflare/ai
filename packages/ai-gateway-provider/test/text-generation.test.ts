import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createAiGateway } from "../src";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_GATEWAY = "my-gateway";

const textGenerationHandler = http.post(
	`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
	async () => {
		return HttpResponse.json({
			object: "chat.completion",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "Hello",
						refusal: null,
					},
				},
			],
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
			gateway: TEST_GATEWAY,
			apiKey: TEST_API_KEY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = await generateText({
			model: aigateway([openai("gpt-4o-mini")]),
			prompt: "Write a greeting",
		});
		expect(result.text).toBe("Hello");
	});
});
