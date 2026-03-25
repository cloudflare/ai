import { TextEncoder } from "node:util";
import { streamText } from "ai";
import { type DefaultBodyType, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";
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

	it("should stream text using Workers AI provider (via streamText)", async () => {
		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
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
							headers: {
								"Content-Type": "text/event-stream",
								"Transfer-Encoding": "chunked",
							},
							status: 200,
						},
					);
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
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
							headers: {
								"Content-Type": "text/event-stream",
								"Transfer-Encoding": "chunked",
							},
							status: 200,
						},
					);
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const model = workersai(TEST_MODEL, {
			aBool: true,
			aNumber: 1,
			aString: "a",
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

	it("should handle streamed tool calls (native format) with tools present", async () => {
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async () => {
					return new Response(
						[
							`data: {"tool_calls":[{"id":"call123","type":"function","index":0,"function":{"name":"get_weather","arguments":"{\\"location\\": \\"London\\"}"}}]}\n\n`,
							`data: {"finish_reason":"tool_calls"}\n\n`,
							"data: [DONE]\n\n",
						].join(""),
						{
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
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Get the weather information for London",
			tools: {
				get_weather: {
					description: "Get the weather in a location",
					execute: async ({ location }) => ({
						location,
						weather: location === "London" ? "Raining" : "Sunny",
					}),
					inputSchema: z.object({
						location: z.string().describe("The location to get the weather for"),
					}),
				},
			},
		});

		const toolCalls: any = [];
		for await (const chunk of result.fullStream) {
			if (chunk.type === "tool-call") {
				toolCalls.push(chunk);
			}
		}

		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0].toolName).toBe("get_weather");
		expect(toolCalls[0].toolCallId).toBe("call123");
		expect(await result.finishReason).toBe("tool-calls");
	});

	it("should handle streamed tool calls (OpenAI format) with tools present", async () => {
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async () => {
					return new Response(
						[
							`data: {"choices":[{"delta":{"tool_calls":[{"id":"chatcmpl-tool-abc","type":"function","index":0,"function":{"name":"get_weather","arguments":"{\\"location\\": \\"London\\"}"}}]},"finish_reason":null}]}\n\n`,
							`data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n`,
							"data: [DONE]\n\n",
						].join(""),
						{
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
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Get the weather information for London",
			tools: {
				get_weather: {
					description: "Get the weather in a location",
					execute: async ({ location }) => ({
						location,
						weather: location === "London" ? "Raining" : "Sunny",
					}),
					inputSchema: z.object({
						location: z.string().describe("The location to get the weather for"),
					}),
				},
			},
		});

		const toolCalls: any = [];
		for await (const chunk of result.fullStream) {
			if (chunk.type === "tool-call") {
				toolCalls.push(chunk);
			}
		}

		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0].toolName).toBe("get_weather");
		expect(toolCalls[0].toolCallId).toBe("chatcmpl-tool-abc");
		expect(await result.finishReason).toBe("tool-calls");
	});

	it("should handle content and reasoning_content fields if present", async () => {
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async () => {
					return new Response(
						[
							`data: {"id":"chatcmpl-edc8406714f74cca9cff55f929272d9a","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":13,"total_tokens":13,"completion_tokens":0}}\n\n`,
							`data: {"id":"chatcmpl-edc8406714f74cca9cff55f929272d9a","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"reasoning_content":"Okay"},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":13,"total_tokens":16,"completion_tokens":3}}\n\n`,
							`data: {"id":"chatcmpl-edc8406714f74cca9cff55f929272d9a","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"reasoning_content":","},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":13,"total_tokens":17,"completion_tokens":4}}\n\n`,
							`data: {"id":"chatcmpl-edc8406714f74cca9cff55f929272d9a","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"reasoning_content":" the"},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":13,"total_tokens":18,"completion_tokens":5}}\n\n`,
							`data: {"id":"chatcmpl-edc8406714f74cca9cff55f929272d9a","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"reasoning_content":" user is asking"},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":13,"total_tokens":19,"completion_tokens":6}}\n\n`,
							`data: {"id":"chatcmpl-7047b0aace8d4e5888c1a01a0673f3ff","object":"chat.completion.chunk","created":1751571006,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"content":"A"},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":13,"total_tokens":461,"completion_tokens":448}}\n\n`,
							`data: {"id":"chatcmpl-7047b0aace8d4e5888c1a01a0673f3ff","object":"chat.completion.chunk","created":1751571006,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"content":" **"},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":13,"total_tokens":462,"completion_tokens":449}}\n\n`,
							`data: {"id":"chatcmpl-7047b0aace8d4e5888c1a01a0673f3ff","object":"chat.completion.chunk","created":1751571006,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"content":"cow is cool"},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":13,"total_tokens":463,"completion_tokens":450}}\n\n`,
							`data: {"id":"chatcmpl-7047b0aace8d4e5888c1a01a0673f3ff","object":"chat.completion.chunk","created":1751571006,"model":"${TEST_MODEL}","choices":[],"usage":{"prompt_tokens":13,"total_tokens":1035,"completion_tokens":1022}}\n\n`,
							"[DONE]\n\n",
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
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			messages: [
				{
					role: "user",
					content: "what is a cow?",
				},
			],
		});

		let reasoning = "";
		let content = "";

		for await (const chunk of result.fullStream) {
			if (chunk.type === "reasoning-delta") {
				reasoning += chunk.text;
			}
			if (chunk.type === "text-delta") {
				content += chunk.text;
			}
		}

		expect(reasoning).toEqual("Okay, the user is asking");
		expect(content).toEqual("A **cow is cool");
	});

	it("should handle reasoning field (without _content suffix) if present", async () => {
		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async () => {
					return new Response(
						[
							`data: {"id":"chatcmpl-r1","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}\n\n`,
							`data: {"id":"chatcmpl-r1","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"reasoning":"Think"},"logprobs":null,"finish_reason":null}]}\n\n`,
							`data: {"id":"chatcmpl-r1","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"reasoning":"ing..."},"logprobs":null,"finish_reason":null}]}\n\n`,
							`data: {"id":"chatcmpl-r1","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}\n\n`,
							`data: {"id":"chatcmpl-r1","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[{"index":0,"delta":{"content":""},"logprobs":null,"finish_reason":"stop"}]}\n\n`,
							`data: {"id":"chatcmpl-r1","object":"chat.completion.chunk","created":1751570976,"model":"${TEST_MODEL}","choices":[]}\n\n`,
							"[DONE]\n\n",
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
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			messages: [{ role: "user", content: "hello" }],
		});

		let reasoning = "";
		let content = "";

		for await (const chunk of result.fullStream) {
			if (chunk.type === "reasoning-delta") {
				reasoning += chunk.text;
			}
			if (chunk.type === "text-delta") {
				content += chunk.text;
			}
		}

		expect(reasoning).toEqual("Thinking...");
		expect(content).toEqual("Hello");
	});
});

describe("Binding - Streaming Text Tests", () => {
	it("should handle chunk without 'response' field gracefully in mock", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, _options?: any) => {
					return mockStream([
						{ response: "Hello " },
						{ p: "no response", tool_calls: [] },
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
				run: async (_modelName: string, _inputs: any, options?: any) => {
					capturedOptions = options;
					return mockStream([{ response: "Hello with options" }, "[DONE]"]);
				},
			},
		});

		const model = workersai(TEST_MODEL, {
			aBool: true,
			aNumber: 1,
			aString: "a",
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

	it("should handle streamed tool calls (native format) via binding", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream([
						{
							tool_calls: [
								{
									id: "call_abc",
									type: "function",
									index: 0,
									function: {
										name: "get_weather",
										arguments: '{"location": "London"}',
									},
								},
							],
						},
						"[DONE]",
					]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Get the weather information for London",
			tools: {
				get_weather: {
					description: "Get the weather in a location",
					execute: async ({ location }) => ({
						location,
						weather: location === "London" ? "Raining" : "Sunny",
					}),
					inputSchema: z.object({
						location: z.string().describe("The location to get the weather for"),
					}),
				},
			},
		});

		const toolCalls: any = [];
		for await (const chunk of result.fullStream) {
			if (chunk.type === "tool-call") {
				toolCalls.push(chunk);
			}
		}

		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0].toolName).toBe("get_weather");
		expect(toolCalls[0].toolCallId).toBe("call_abc");
	});

	it("should handle streamed multiple tool calls via binding", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream([
						{
							tool_calls: [
								{
									id: "call_1",
									type: "function",
									index: 0,
									function: {
										name: "get_weather",
										arguments: '{"location": "London"}',
									},
								},
							],
						},
						{
							tool_calls: [
								{
									id: "call_2",
									type: "function",
									index: 1,
									function: {
										name: "get_temperature",
										arguments: '{"location": "London"}',
									},
								},
							],
						},
						"[DONE]",
					]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Get the weather information for London",
			tools: {
				get_temperature: {
					description: "Get the temperature in a location",
					execute: async ({ location }) => ({
						location,
						weather: location === "London" ? "80" : "100",
					}),
					inputSchema: z.object({
						location: z.string().describe("The location to get the temperature for"),
					}),
				},
				get_weather: {
					description: "Get the weather in a location",
					execute: async ({ location }) => ({
						location,
						weather: location === "London" ? "Raining" : "Sunny",
					}),
					inputSchema: z.object({
						location: z.string().describe("The location to get the weather for"),
					}),
				},
			},
		});

		const toolCalls: any = [];
		for await (const chunk of result.fullStream) {
			if (chunk.type === "tool-call") {
				toolCalls.push(chunk);
			}
		}

		expect(toolCalls).toHaveLength(2);
		expect(toolCalls[0].toolName).toBe("get_weather");
		expect(toolCalls[1].toolName).toBe("get_temperature");
	});

	it("should handle streamed OpenAI-format tool calls with reasoning via binding", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream([
						{
							choices: [
								{
									delta: { reasoning_content: "Let me check the weather." },
									finish_reason: null,
								},
							],
						},
						{
							choices: [
								{
									delta: {
										tool_calls: [
											{
												id: "chatcmpl-tool-abc",
												type: "function",
												index: 0,
												function: {
													name: "get_weather",
													arguments: '{"location": "London"}',
												},
											},
										],
									},
									finish_reason: null,
								},
							],
						},
						{
							choices: [{ delta: {}, finish_reason: "tool_calls" }],
						},
						"[DONE]",
					]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Get the weather information for London",
			tools: {
				get_weather: {
					description: "Get the weather in a location",
					execute: async ({ location }) => ({
						location,
						weather: location === "London" ? "Raining" : "Sunny",
					}),
					inputSchema: z.object({
						location: z.string().describe("The location to get the weather for"),
					}),
				},
			},
		});

		const toolCalls: any = [];
		let reasoning = "";

		for await (const chunk of result.fullStream) {
			if (chunk.type === "tool-call") {
				toolCalls.push(chunk);
			}
			if (chunk.type === "reasoning-delta") {
				reasoning += chunk.text;
			}
		}

		expect(reasoning).toBe("Let me check the weather.");
		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0].toolName).toBe("get_weather");
		expect(toolCalls[0].toolCallId).toBe("chatcmpl-tool-abc");
		expect(await result.finishReason).toBe("tool-calls");
	});

	it("should close reasoning block before emitting tool calls", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream([
						{
							choices: [
								{
									delta: { reasoning_content: "Let me think" },
									finish_reason: null,
								},
							],
						},
						{
							choices: [
								{
									delta: { reasoning_content: " about this." },
									finish_reason: null,
								},
							],
						},
						{
							choices: [
								{
									delta: {
										tool_calls: [
											{
												id: "call-1",
												type: "function",
												index: 0,
												function: {
													name: "get_weather",
													arguments: '{"location": "Paris"}',
												},
											},
										],
									},
									finish_reason: null,
								},
							],
						},
						{
							choices: [{ delta: {}, finish_reason: "tool_calls" }],
						},
						"[DONE]",
					]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "What's the weather?",
			tools: {
				get_weather: {
					description: "Get the weather",
					execute: async ({ location }) => ({ location, weather: "Sunny" }),
					inputSchema: z.object({
						location: z.string(),
					}),
				},
			},
		});

		const events: string[] = [];
		for await (const chunk of result.fullStream) {
			events.push(chunk.type);
		}

		// reasoning-end must appear BEFORE tool-input-start and tool-call
		const reasoningEndIdx = events.indexOf("reasoning-end");
		const toolInputStartIdx = events.indexOf("tool-input-start");
		const toolCallIdx = events.indexOf("tool-call");

		expect(reasoningEndIdx).toBeGreaterThan(-1);
		expect(toolInputStartIdx).toBeGreaterThan(-1);
		expect(toolCallIdx).toBeGreaterThan(-1);
		expect(reasoningEndIdx).toBeLessThan(toolInputStartIdx);
		expect(reasoningEndIdx).toBeLessThan(toolCallIdx);

		// reasoning-end should NOT appear again in flush (no double close)
		const reasoningEndCount = events.filter((e) => e === "reasoning-end").length;
		expect(reasoningEndCount).toBe(1);
	});

	it("should close reasoning block before emitting text content", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream([
						{
							choices: [
								{
									delta: { reasoning: "Thinking..." },
									finish_reason: null,
								},
							],
						},
						{
							choices: [
								{
									delta: { content: "Hello world" },
									finish_reason: null,
								},
							],
						},
						{
							choices: [{ delta: {}, finish_reason: "stop" }],
						},
						"[DONE]",
					]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Hello",
		});

		const events: string[] = [];
		for await (const chunk of result.fullStream) {
			events.push(chunk.type);
		}

		const reasoningEndIdx = events.indexOf("reasoning-end");
		const textStartIdx = events.indexOf("text-start");

		expect(reasoningEndIdx).toBeGreaterThan(-1);
		expect(textStartIdx).toBeGreaterThan(-1);
		expect(reasoningEndIdx).toBeLessThan(textStartIdx);

		// No double close
		const reasoningEndCount = events.filter((e) => e === "reasoning-end").length;
		expect(reasoningEndCount).toBe(1);
	});

	it("should handle content and reasoning_content fields if present", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream([
						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { reasoning_content: "Okay" },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 16,
								completion_tokens: 3,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { reasoning_content: "," },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 17,
								completion_tokens: 4,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { reasoning_content: " the" },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 18,
								completion_tokens: 5,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { reasoning_content: " user" },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 19,
								completion_tokens: 6,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { reasoning_content: " is asking" },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 20,
								completion_tokens: 7,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { content: "\n\n" },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 557,
								completion_tokens: 544,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { content: "A" },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 558,
								completion_tokens: 545,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { content: " cow" },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 559,
								completion_tokens: 546,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { content: " is cool" },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 1224,
								completion_tokens: 1211,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { content: "." },
									logprobs: null,
									finish_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 1225,
								completion_tokens: 1212,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { content: "" },
									logprobs: null,
									finish_reason: "stop",
									stop_reason: null,
								},
							],
							usage: {
								prompt_tokens: 13,
								total_tokens: 1226,
								completion_tokens: 1213,
							},
						},

						{
							id: "chatcmpl-66bc193872fa4979a778bbbdee8c22f9",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [],
							usage: {
								prompt_tokens: 13,
								total_tokens: 1226,
								completion_tokens: 1213,
							},
						},

						"[DONE]",
					]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			messages: [
				{
					role: "user",
					content: "what is a cow?",
				},
			],
		});

		let reasoning = "";
		let content = "";

		for await (const chunk of result.fullStream) {
			if (chunk.type === "reasoning-delta") {
				reasoning += chunk.text;
			}
			if (chunk.type === "text-delta") {
				content += chunk.text;
			}
		}

		expect(reasoning).toEqual("Okay, the user is asking");
		expect(content).toEqual("\n\nA cow is cool.");
	});

	it("should handle reasoning field (without _content suffix) if present", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream([
						{
							id: "chatcmpl-r2",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { reasoning: "Think" },
									logprobs: null,
									finish_reason: null,
								},
							],
						},
						{
							id: "chatcmpl-r2",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { reasoning: "ing..." },
									logprobs: null,
									finish_reason: null,
								},
							],
						},
						{
							id: "chatcmpl-r2",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { content: "Hello" },
									logprobs: null,
									finish_reason: null,
								},
							],
						},
						{
							id: "chatcmpl-r2",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [
								{
									index: 0,
									delta: { content: "" },
									logprobs: null,
									finish_reason: "stop",
								},
							],
						},
						{
							id: "chatcmpl-r2",
							object: "chat.completion.chunk",
							created: 1751559514,
							model: TEST_MODEL,
							choices: [],
						},
						"[DONE]",
					]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			messages: [{ role: "user", content: "hello" }],
		});

		let reasoning = "";
		let content = "";

		for await (const chunk of result.fullStream) {
			if (chunk.type === "reasoning-delta") {
				reasoning += chunk.text;
			}
			if (chunk.type === "text-delta") {
				content += chunk.text;
			}
		}

		expect(reasoning).toEqual("Thinking...");
		expect(content).toEqual("Hello");
	});
});

describe("REST API - Finish Reason Handling", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	describe("Finish Reason Extraction", () => {
		it("should extract 'stop' finish reason from stream", async () => {
			server.use(
				http.post(
					`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
					async () => {
						return new Response(
							[
								`data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n`,
								`data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n`,
								"data: [DONE]\n\n",
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
				),
			);

			const workersai = createWorkersAI({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
			});

			const result = streamText({
				model: workersai(TEST_MODEL),
				prompt: "test",
			});

			await result.text;
			const finishReason = await result.finishReason;

			expect(finishReason).toBe("stop");
		});

		it("should extract 'tool-calls' finish reason from stream", async () => {
			server.use(
				http.post(
					`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
					async () => {
						return new Response(
							[
								`data: {"choices":[{"delta":{"content":"Calling weather"},"finish_reason":null}]}\n\n`,
								`data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n`,
								"data: [DONE]\n\n",
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
				),
			);

			const workersai = createWorkersAI({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
			});

			const result = streamText({
				model: workersai(TEST_MODEL),
				prompt: "test",
			});

			await result.text;
			const finishReason = await result.finishReason;

			expect(finishReason).toBe("tool-calls");
		});

		it("should extract 'length' finish reason from stream", async () => {
			server.use(
				http.post(
					`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
					async () => {
						return new Response(
							[
								`data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n`,
								`data: {"choices":[{"delta":{"content":" world"},"finish_reason":"length"}]}\n\n`,
								"data: [DONE]\n\n",
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
				),
			);

			const workersai = createWorkersAI({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
			});

			const result = streamText({
				model: workersai(TEST_MODEL),
				prompt: "test",
			});

			await result.text;
			const finishReason = await result.finishReason;

			expect(finishReason).toBe("length");
		});

		it("should extract 'model_length' and map to 'length'", async () => {
			server.use(
				http.post(
					`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
					async () => {
						return new Response(
							[
								`data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n`,
								`data: {"choices":[{"delta":{"content":" world"},"finish_reason":"model_length"}]}\n\n`,
								"data: [DONE]\n\n",
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
				),
			);

			const workersai = createWorkersAI({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
			});

			const result = streamText({
				model: workersai(TEST_MODEL),
				prompt: "test",
			});

			await result.text;
			const finishReason = await result.finishReason;

			expect(finishReason).toBe("length");
		});

		it("should extract 'error' finish reason from stream", async () => {
			server.use(
				http.post(
					`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
					async () => {
						return new Response(
							[
								`data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n`,
								`data: {"choices":[{"delta":{},"finish_reason":"error"}]}\n\n`,
								"data: [DONE]\n\n",
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
				),
			);

			const workersai = createWorkersAI({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
			});

			const result = streamText({
				model: workersai(TEST_MODEL),
				prompt: "test",
			});

			await result.text;
			const finishReason = await result.finishReason;

			expect(finishReason).toBe("error");
		});

		it("should default to 'stop' when no finish_reason in stream", async () => {
			server.use(
				http.post(
					`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
					async () => {
						return new Response(
							[
								`data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n`,
								`data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n`,
								"data: [DONE]\n\n",
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
				),
			);

			const workersai = createWorkersAI({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
			});

			const result = streamText({
				model: workersai(TEST_MODEL),
				prompt: "test",
			});

			await result.text;
			const finishReason = await result.finishReason;

			expect(finishReason).toBe("stop");
		});

		it("should handle finish_reason from direct property (not in choices)", async () => {
			server.use(
				http.post(
					`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
					async () => {
						return new Response(
							[
								`data: {"response":"Hello","finish_reason":null}\n\n`,
								`data: {"response":" world","finish_reason":"stop"}\n\n`,
								"data: [DONE]\n\n",
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
				),
			);

			const workersai = createWorkersAI({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
			});

			const result = streamText({
				model: workersai(TEST_MODEL),
				prompt: "test",
			});

			await result.text;
			const finishReason = await result.finishReason;

			expect(finishReason).toBe("stop");
		});

		it("should use last finish_reason when multiple chunks provide it", async () => {
			server.use(
				http.post(
					`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
					async () => {
						return new Response(
							[
								`data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"length"}]}\n\n`,
								`data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n`,
								"data: [DONE]\n\n",
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
				),
			);

			const workersai = createWorkersAI({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
			});

			const result = streamText({
				model: workersai(TEST_MODEL),
				prompt: "test",
			});

			await result.text;
			const finishReason = await result.finishReason;

			// Should use the last one
			expect(finishReason).toBe("stop");
		});
	});
});

describe("REST API - Streaming Fallback", () => {
	const fallbackServer = setupServer();
	beforeAll(() => fallbackServer.listen());
	afterEach(() => fallbackServer.resetHandlers());
	afterAll(() => fallbackServer.close());

	it("should retry without streaming when REST returns JSON instead of SSE", async () => {
		let callCount = 0;
		fallbackServer.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async ({ request }) => {
					callCount++;
					const body = (await request.json()) as Record<string, unknown>;

					if (body.stream === true) {
						// First call: model doesn't support streaming, returns empty JSON
						return new Response(
							JSON.stringify({ result: {}, success: true, errors: [], messages: [] }),
							{ headers: { "Content-Type": "application/json" } },
						);
					}

					// Second call: non-streaming retry returns real content
					return new Response(
						JSON.stringify({
							result: { response: "Hello from non-streaming fallback!" },
						}),
						{ headers: { "Content-Type": "application/json" } },
					);
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Hello",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Hello from non-streaming fallback!");
		expect(callCount).toBe(2); // First call streams (fails), second retries non-streaming
	});
});

describe("Incremental Tool Call Streaming", () => {
	it("should emit tool-input-start and tool-input-delta events incrementally", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: Record<string, unknown>) => {
					if (inputs.stream) {
						// Simulate incremental tool call streaming
						return mockStream([
							{
								tool_calls: [
									{
										id: "call1",
										type: "function",
										index: 0,
										function: { name: "get_weather", arguments: '{"loc' },
									},
								],
							},
							{ tool_calls: [{ index: 0, function: { arguments: 'ation": "' } }] },
							{ tool_calls: [{ index: 0, function: { arguments: 'London"}' } }] },
							{ finish_reason: "tool_calls" },
							"[DONE]",
						]);
					}
					return { response: "" };
				},
			} as any,
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Weather?",
			tools: {
				get_weather: {
					description: "Get weather",
					inputSchema: z.object({
						location: z.string(),
					}),
				},
			},
		});

		const parts: any[] = [];
		for await (const chunk of result.fullStream) {
			parts.push(chunk);
		}

		// Should have a tool-call at the end (assembled from incremental events)
		const toolCall = parts.find((p) => p.type === "tool-call");
		expect(toolCall).toBeDefined();
		expect(toolCall.toolName).toBe("get_weather");
		expect(toolCall.toolCallId).toBe("call1");

		// The AI SDK assembles and parses the full arguments from incremental events
		const args = toolCall.args ?? toolCall.input;
		if (typeof args === "string") {
			expect(JSON.parse(args)).toEqual({ location: "London" });
		} else {
			expect(args).toEqual({ location: "London" });
		}
	});
});

describe("Streaming Error Handling", () => {
	it("should handle malformed SSE events gracefully", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream(
						[
							{ response: "Hello" },
							"INVALID_JSON{{{",
							{ response: " world" },
							"[DONE]",
						],
						{ raw: true },
					);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Test malformed SSE",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		// Malformed event should be skipped, valid events still processed
		expect(text).toBe("Hello world");
	});

	it("should handle empty stream (no events before close)", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream(["[DONE]"]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Test empty stream",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("");
		expect(await result.finishReason).toBe("stop");
	});

	it("should handle stream with only [DONE] and no content", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return mockStream([{ response: "", tool_calls: [] }, "[DONE]"]);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Test minimal stream",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("");
	});

	it("should detect premature stream termination (no [DONE])", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					// Stream ends without [DONE]
					return mockStream([{ response: "partial" }], { noDone: true });
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Test truncated stream",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("partial");
		// Should detect truncation and report error finish reason
		expect(await result.finishReason).toBe("error");
	});
});

describe("Streaming Backpressure", () => {
	it("should deliver chunks incrementally, not buffered all at once", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					// Simulate a slow stream: each chunk arrives 10ms apart
					return delayedMockStream(
						[
							{ response: "chunk1" },
							{ response: "chunk2" },
							{ response: "chunk3" },
							{ response: "chunk4" },
							"[DONE]",
						],
						10,
					);
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Test incremental streaming",
		});

		const chunkTimestamps: number[] = [];
		const start = Date.now();

		for await (const _chunk of result.textStream) {
			chunkTimestamps.push(Date.now() - start);
		}

		// We should have received 4 text chunks
		expect(chunkTimestamps.length).toBe(4);

		// The chunks should NOT all arrive at the same time.
		// If buffered, all timestamps would be ~equal (within 1-2ms).
		// With proper streaming, later chunks arrive later.
		const lastTimestamp = chunkTimestamps[chunkTimestamps.length - 1];
		const firstTimestamp = chunkTimestamps[0];
		const spread = lastTimestamp - firstTimestamp;

		// With 4 chunks at 10ms apart, spread should be >= ~20ms
		// (some tolerance for scheduling jitter)
		expect(spread).toBeGreaterThanOrEqual(15);
	});
});

describe("Graceful Degradation", () => {
	it("should wrap non-streaming response as a stream when binding returns object", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					// Binding returns a complete response instead of a stream
					return {
						response: "Hello from non-streaming fallback",
						usage: {
							prompt_tokens: 10,
							completion_tokens: 5,
						},
					};
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Test graceful degradation",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Hello from non-streaming fallback");
		expect(await result.finishReason).toBe("stop");
	});

	it("should handle non-streaming OpenAI-format response with tool calls", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return {
						choices: [
							{
								message: {
									content: "",
									tool_calls: [
										{
											id: "call_abc",
											type: "function",
											function: {
												name: "get_weather",
												arguments: '{"city": "London"}',
											},
										},
									],
								},
								finish_reason: "tool_calls",
							},
						],
					};
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "What's the weather?",
			tools: {
				get_weather: {
					description: "Get weather",
					execute: async ({ city }) => ({ city, temp: 18 }),
					inputSchema: z.object({ city: z.string() }),
				},
			},
		});

		const toolCalls: any[] = [];
		for await (const chunk of result.fullStream) {
			if (chunk.type === "tool-call") {
				toolCalls.push(chunk);
			}
		}

		expect(toolCalls).toHaveLength(1);
		expect(toolCalls[0].toolName).toBe("get_weather");
		expect(await result.finishReason).toBe("tool-calls");
	});

	it("should handle non-streaming response with reasoning content", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return {
						choices: [
							{
								message: {
									reasoning_content: "Let me think about this...",
									content: "The answer is 42.",
								},
								finish_reason: "stop",
							},
						],
					};
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Think carefully",
		});

		let text = "";
		let reasoning = "";
		for await (const chunk of result.fullStream) {
			if (chunk.type === "text-delta") text += chunk.text;
			if (chunk.type === "reasoning-delta") reasoning += chunk.text;
		}

		expect(text).toBe("The answer is 42.");
		expect(reasoning).toBe("Let me think about this...");
	});

	it("should handle non-streaming response with reasoning field (without _content suffix)", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return {
						choices: [
							{
								message: {
									reasoning: "Let me reason about this...",
									content: "The answer is 7.",
								},
								finish_reason: "stop",
							},
						],
					};
				},
			},
		});

		const result = streamText({
			model: workersai(TEST_MODEL),
			prompt: "Think carefully",
		});

		let text = "";
		let reasoning = "";
		for await (const chunk of result.fullStream) {
			if (chunk.type === "text-delta") text += chunk.text;
			if (chunk.type === "reasoning-delta") reasoning += chunk.text;
		}

		expect(text).toBe("The answer is 7.");
		expect(reasoning).toBe("Let me reason about this...");
	});
});

/**
 * Helper to produce SSE lines in a Node ReadableStream.
 */
function mockStream(
	sseLines: any[],
	options?: { raw?: boolean; noDone?: boolean },
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const line of sseLines) {
				if (typeof line === "string") {
					if (options?.raw) {
						controller.enqueue(encoder.encode(`data: ${line}\n\n`));
					} else {
						controller.enqueue(encoder.encode(`data: ${line}\n\n`));
					}
				} else {
					const jsonText = JSON.stringify(line);
					controller.enqueue(encoder.encode(`data: ${jsonText}\n\n`));
				}
			}
			if (!options?.noDone && !sseLines.includes("[DONE]")) {
				// Don't add [DONE] if already present or if noDone is set
			}
			controller.close();
		},
	});
}

/**
 * Helper that enqueues SSE lines with a delay between each, simulating a real
 * streaming response from Workers AI.
 */
function delayedMockStream(sseLines: any[], delayMs: number): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let index = 0;

	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (index >= sseLines.length) {
				controller.close();
				return;
			}

			await new Promise((r) => setTimeout(r, delayMs));

			const line = sseLines[index++];
			if (typeof line === "string") {
				controller.enqueue(encoder.encode(`data: ${line}\n\n`));
			} else {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
			}
		},
	});
}
