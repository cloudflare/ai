import { TextEncoder } from "node:util";
import { streamText } from "ai";
import { http, type DefaultBodyType } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createWorkersAI } from "../src/index";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const defaultStreamingHandler = http.post(
	`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
	async () => {
		return new Response(
			[
				`data: {"response":"Hello chunk1"}\n\n`,
				`data: {"response":"Hello chunk2"}\n\n`,
				"data: [DONE]\n\n",
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

	it("should stream text using Workers AI provider (via streamText)", async () => {
		const workersai = createWorkersAI({
			apiKey: TEST_API_KEY,
			accountId: TEST_ACCOUNT_ID,
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Please write a multi-part greeting",
		});

		let accumulatedText = "";
		for await (const chunk of result.textStream) {
			accumulatedText += chunk;
		}

		expect(accumulatedText).toBe("Hello chunk1Hello chunk2");
	});

	it("should handle chunk without 'response' field gracefully", async () => {
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async () => {
					// Notice that the second chunk has no 'response' property,
					// just tool_calls and p fields, plus an extra brace.
					return new Response(
						[
							`data: {"response":"Hello chunk1"}\n\n`,
							`data: {"tool_calls":[],"p":"abdefgh"}\n\n`,
							"data: [DONE]\n\n",
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
			),
		);

		const workersai = createWorkersAI({
			apiKey: TEST_API_KEY,
			accountId: TEST_ACCOUNT_ID,
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "test chunk without response",
		});

		let finalText = "";
		for await (const chunk of result.textStream) {
			finalText += chunk;
		}

		expect(finalText).toBe("Hello chunk1");
	});

	it("should pass through additional options to the AI run method", async () => {
		let capturedOptions: null | DefaultBodyType = null;

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async ({ request }) => {
					// get passthrough params from url query
					const url = new URL(request.url);
					capturedOptions = Object.fromEntries(url.searchParams.entries());

					return new Response(
						[`data: {"response":"Hello with options"}\n\n`, "data: [DONE]\n\n"].join(
							"",
						),
						{
							status: 200,
							headers: {
								"Content-Type": "text/event-stream",
								"Transfer-Encoding": "chunked",
							},
						},
					);
				},
			),
		);

		const workersai = createWorkersAI({
			apiKey: TEST_API_KEY,
			accountId: TEST_ACCOUNT_ID,
		});

		const model = workersai(TEST_MODEL, {
			aString: "a",
			aBool: true,
			aNumber: 1,
		});

		const result = streamText({
			model: model,
			prompt: "Test with custom options",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Hello with options");
		expect(capturedOptions).toHaveProperty("aString", "a");
		expect(capturedOptions).toHaveProperty("aBool", "true");
		expect(capturedOptions).toHaveProperty("aNumber", "1");
	});
});

describe("Binding - Streaming Text Tests", () => {
	it("should handle chunk without 'response' field gracefully in mock", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async (modelName: string, inputs: any, options?: any) => {
					return mockStream([
						{ response: "Hello " },
						{ tool_calls: [], p: "no response" },
						{ response: "world!" },
						"[DONE]",
					]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Test chunk without response",
		});

		let finalText = "";
		for await (const chunk of result.textStream) {
			finalText += chunk;
		}

		// The second chunk is missing 'response', so it is skipped
		// The first and third chunks are appended => "Hello world!"
		expect(finalText).toBe("Hello world!");
	});

	it("should pass through additional options to the AI run method in the mock", async () => {
		let capturedOptions: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (modelName: string, inputs: any, options?: any) => {
					capturedOptions = options;
					return mockStream([{ response: "Hello with options" }, "[DONE]"]);
				},
			},
		});

		const model = workersai(TEST_MODEL, {
			aString: "a",
			aBool: true,
			aNumber: 1,
		});

		const result = streamText({
			model: model,
			prompt: "Test with custom options",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Hello with options");
		expect(capturedOptions).toHaveProperty("aString", "a");
		expect(capturedOptions).toHaveProperty("aBool", true);
		expect(capturedOptions).toHaveProperty("aNumber", 1);
	});
});

/**
 * Helper to produce SSE lines in a Node ReadableStream.
 * This is the crucial part: each line is preceded by "data: ",
 * followed by JSON or [DONE], then a newline+newline.
 */
function mockStream(sseLines: any[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of sseLines) {
				// Typically "line" is either an object or "[DONE]"
				if (typeof line === "string") {
					// e.g. the [DONE] marker
					controller.enqueue(encoder.encode(`data: ${line}\n\n`));
				} else {
					// Convert JS object (e.g. { response: "Hello " }) to JSON
					const jsonText = JSON.stringify(line);
					controller.enqueue(encoder.encode(`data: ${jsonText}\n\n`));
				}
			}
			controller.close();
		},
	});
}
