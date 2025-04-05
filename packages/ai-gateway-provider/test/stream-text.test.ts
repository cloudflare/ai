import { streamText } from "ai";
import { http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAiGateway } from "../src";
import { createOpenAI } from "@ai-sdk/openai";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_GATEWAY = "my-gateway";

const defaultStreamingHandler = http.post(
	`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
	async () => {
		return new Response(
			[
				`data: {"nonce": "c673", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"role":"assistant","content":"","refusal":null},"logprobs":null,"finish_reason":null}]}\n\n`,
				`data: {"nonce": "29", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}\n\n`,
				`data: {"nonce": "4024247058da", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"content":" chunk"},"logprobs":null,"finish_reason":null}]}\n\n`,
				`data: {"nonce": "09fe25", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"content":"1"},"logprobs":null,"finish_reason":null}]}\n\n`,
				`data: {"nonce": "2e7d0f", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}\n\n`,
				`data: {"nonce": "34be46e25b", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"content":" chunk"},"logprobs":null,"finish_reason":null}]}\n\n`,
				`data: {"nonce": "9d", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"content":"2"},"logprobs":null,"finish_reason":null}]}\n\n`,
				`data: {"nonce": "7751", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}\n\n`,
				"data: [DONE]",
			].join(""),
			{
				status: 200,
				headers: {
					"Content-Type": "text/event-stream",
					"Transfer-Encoding": "chunked",
				},
			},
		);
	},
);

const server = setupServer(defaultStreamingHandler);

describe("REST API - Streaming Text Tests", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should stream text using", async () => {
		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			gateway: TEST_GATEWAY,
			apiKey: TEST_API_KEY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = streamText({
			model: aigateway([openai("gpt-4o-mini")]),
			prompt: "Please write a multi-part greeting",
		});

		let accumulatedText = "";
		for await (const chunk of result.textStream) {
			accumulatedText += chunk;
		}

		expect(accumulatedText).toBe("Hello chunk1Hello chunk2");
	});
});

describe("Binding - Streaming Text Tests", () => {
	it("should handle chunk", async () => {
		const aigateway = createAiGateway({
			binding: {
				run: async () => {
					return new Response(
						[
							`data: {"nonce": "c673", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"role":"assistant","content":"","refusal":null},"logprobs":null,"finish_reason":null}]}\n\n`,
							`data: {"nonce": "29", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}\n\n`,
							`data: {"nonce": "4024247058da", "id":"chatcmpl-BOlQHy37KaTjcGB9k04XEztiEI1Df","object":"chat.completion.chunk","created":1745241865,"model":"gpt-4o-mini-2024-07-18","service_tier":"default","system_fingerprint":"fp_0392822090","choices":[{"index":0,"delta":{"content":" world!"},"logprobs":null,"finish_reason":null}]}\n\n`,
							"data: [DONE]",
						].join(""),
						{
							status: 200,
							headers: {
								"Content-Type": "text/event-stream",
								"Transfer-Encoding": "chunked",
							},
						},
					);
				},
			},
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = streamText({
			model: aigateway([openai("gpt-4o-mini")]),
			prompt: "Write a greeting",
		});

		let finalText = "";
		for await (const chunk of result.textStream) {
			finalText += chunk;
		}

		// The second chunk is missing 'response', so it is skipped
		// The first and third chunks are appended => "Hello world!"
		expect(finalText).toBe("Hello world!");
	});
});
