import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAiGateway } from "../src";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_GATEWAY = "my-gateway";

const defaultStreamingHandler = http.post(
	`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
	async () => {
		return new Response(
			[
				`data: {"type": "response.created", "response": {"id": "resp-test123", "created_at": ${Math.floor(Date.now() / 1000)}, "model": "gpt-4o-mini"}}\n\n`,
				`data: {"type": "response.output_item.added", "output_index": 0, "item": {"type": "message", "role": "assistant", "id": "msg-test123", "content": []}}\n\n`,
				`data: {"type": "response.output_text.delta", "item_id": "msg-test123", "delta": "Hello"}\n\n`,
				`data: {"type": "response.output_text.delta", "item_id": "msg-test123", "delta": " chunk"}\n\n`,
				`data: {"type": "response.output_text.delta", "item_id": "msg-test123", "delta": "1"}\n\n`,
				`data: {"type": "response.output_text.delta", "item_id": "msg-test123", "delta": "Hello"}\n\n`,
				`data: {"type": "response.output_text.delta", "item_id": "msg-test123", "delta": " chunk"}\n\n`,
				`data: {"type": "response.output_text.delta", "item_id": "msg-test123", "delta": "2"}\n\n`,
				`data: {"type": "response.output_item.done", "output_index": 0, "item": {"type": "message", "role": "assistant", "id": "msg-test123", "content": [{"type": "output_text", "text": "Hello chunk1Hello chunk2", "annotations": []}]}}\n\n`,
				`data: {"type": "response.completed", "response": {"id": "resp-test123", "created_at": ${Math.floor(Date.now() / 1000)}, "model": "gpt-4o-mini", "output": [{"type": "message", "role": "assistant", "id": "msg-test123", "content": [{"type": "output_text", "text": "Hello chunk1Hello chunk2", "annotations": []}]}], "incomplete_details": null, "object": "response", "usage": {"input_tokens": 10, "output_tokens": 8, "total_tokens": 18}}}\n\n`,
				"data: [DONE]",
			].join(""),
			{
				headers: {
					"Content-Type": "text/event-stream",
					"Transfer-Encoding": "chunked",
				},
				status: 200,
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
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
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
							`data: {"type": "response.created", "response": {"id": "resp-test123", "created_at": ${Math.floor(Date.now() / 1000)}, "model": "gpt-4o-mini"}}\n\n`,
							`data: {"type": "response.output_item.added", "output_index": 0, "item": {"type": "message", "role": "assistant", "id": "msg-test123", "content": []}}\n\n`,
							`data: {"type": "response.output_text.delta", "item_id": "msg-test123", "delta": "Hello"}\n\n`,
							`data: {"type": "response.output_text.delta", "item_id": "msg-test123", "delta": " world!"}\n\n`,
							`data: {"type": "response.output_item.done", "output_index": 0, "item": {"type": "message", "role": "assistant", "id": "msg-test123", "content": [{"type": "output_text", "text": "Hello world!", "annotations": []}]}}\n\n`,
							`data: {"type": "response.completed", "response": {"id": "resp-test123", "created_at": ${Math.floor(Date.now() / 1000)}, "model": "gpt-4o-mini", "output": [{"type": "message", "role": "assistant", "id": "msg-test123", "content": [{"type": "output_text", "text": "Hello world!", "annotations": []}]}], "incomplete_details": null, "object": "response", "usage": {"input_tokens": 5, "output_tokens": 2, "total_tokens": 7}}}\n\n`,
							"data: [DONE]",
						].join(""),
						{
							headers: {
								"Content-Type": "text/event-stream",
								"Transfer-Encoding": "chunked",
							},
							status: 200,
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

		// Delta chunks are combined to produce the final text => "Hello world!"
		expect(finalText).toBe("Hello world!");
	});
});
