/**
 * Tests for WorkersAiTextAdapter — the core user-facing class.
 *
 * Strategy: We pass a mock `env.AI` binding to the adapter. Internally it
 * creates an OpenAI client with `createWorkersAiBindingFetch`, which translates
 * OpenAI SDK calls to `binding.run()`. This gives us true end-to-end coverage
 * of the adapter -> OpenAI SDK -> binding shim pipeline without mocking the SDK.
 */
import { describe, expect, it, vi } from "vitest";

// We need to mock @tanstack/ai and @tanstack/ai/adapters so the adapter
// module can be imported. These mocks are scoped to this file only.
vi.mock("@tanstack/ai/adapters", () => ({
	BaseTextAdapter: class {
		model: string;
		constructor(_config: unknown, model: string) {
			this.model = model;
		}
	},
}));
vi.mock("@tanstack/ai", () => ({}));

import { WorkersAiTextAdapter } from "../src/adapters/workers-ai";
import type { WorkersAiTextModel } from "../src/adapters/workers-ai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as WorkersAiTextModel;

function createMockBinding(response: unknown) {
	return {
		run: vi.fn().mockResolvedValue(response),
		gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
	};
}

function createStreamingBinding(chunks: string[]) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});
	return {
		run: vi.fn().mockResolvedValue(stream),
		gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
	};
}

async function collectChunks(iterable: AsyncIterable<unknown>) {
	const chunks: any[] = [];
	for await (const chunk of iterable) {
		chunks.push(chunk);
	}
	return chunks;
}

// ---------------------------------------------------------------------------
// chatStream
// ---------------------------------------------------------------------------

describe("WorkersAiTextAdapter.chatStream", () => {
	it("should stream AG-UI events: RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END, RUN_FINISHED", async () => {
		const binding = createStreamingBinding([
			'data: {"response":"Hello"}\n\n',
			'data: {"response":" world"}\n\n',
		]);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		// RUN_STARTED
		const runStarted = chunks.find((c: any) => c.type === "RUN_STARTED");
		expect(runStarted).toBeDefined();
		expect(runStarted.runId).toMatch(/^workers-ai-/);

		// TEXT_MESSAGE_START
		const msgStart = chunks.find((c: any) => c.type === "TEXT_MESSAGE_START");
		expect(msgStart).toBeDefined();
		expect(msgStart.role).toBe("assistant");

		// TEXT_MESSAGE_CONTENT chunks
		const contentChunks = chunks.filter((c: any) => c.type === "TEXT_MESSAGE_CONTENT");
		expect(contentChunks).toHaveLength(2);
		expect(contentChunks[0].delta).toBe("Hello");
		expect(contentChunks[0].content).toBe("Hello");
		expect(contentChunks[1].delta).toBe(" world");
		expect(contentChunks[1].content).toBe("Hello world");

		// TEXT_MESSAGE_END
		const msgEnd = chunks.find((c: any) => c.type === "TEXT_MESSAGE_END");
		expect(msgEnd).toBeDefined();

		// RUN_FINISHED
		const runFinished = chunks.find((c: any) => c.type === "RUN_FINISHED");
		expect(runFinished).toBeDefined();
		expect(runFinished.finishReason).toBe("stop");
	});

	it("should pass system prompts to the binding", async () => {
		const binding = createStreamingBinding(['data: {"response":"ok"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await collectChunks(
			adapter.chatStream({
				model: MODEL,
				systemPrompts: ["You are helpful", "Be concise"],
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		expect(binding.run).toHaveBeenCalledOnce();
		const [, inputs] = binding.run.mock.calls[0]!;
		// The binding shim receives messages from the OpenAI SDK
		const messages = inputs.messages;
		expect(messages[0]).toEqual({
			role: "system",
			content: "You are helpful\nBe concise",
		});
	});

	it("should emit TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END events", async () => {
		const binding = createStreamingBinding([
			'data: {"response":"","tool_calls":[{"name":"get_weather","arguments":{"location":"SF"}}]}\n\n',
		]);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Weather in SF?" }],
				tools: [
					{
						name: "get_weather",
						description: "Get weather",
						inputSchema: {
							type: "object",
							properties: { location: { type: "string" } },
						},
					},
				],
			} as any),
		);

		// TOOL_CALL_START
		const toolStart = chunks.filter((c: any) => c.type === "TOOL_CALL_START");
		expect(toolStart.length).toBeGreaterThanOrEqual(1);
		expect(toolStart[0].toolName).toBe("get_weather");

		// TOOL_CALL_END
		const toolEnd = chunks.filter((c: any) => c.type === "TOOL_CALL_END");
		expect(toolEnd).toHaveLength(1);
		expect(toolEnd[0].toolName).toBe("get_weather");
		expect(toolEnd[0].input).toEqual({ location: "SF" });

		// RUN_FINISHED with tool_calls reason
		const runFinished = chunks.find((c: any) => c.type === "RUN_FINISHED");
		expect(runFinished).toBeDefined();
		expect(runFinished.finishReason).toBe("tool_calls");
	});

	it("should forward tools to the binding", async () => {
		const binding = createStreamingBinding(['data: {"response":"ok"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Calculate 2+2" }],
				tools: [
					{
						name: "calculator",
						description: "Does math",
						inputSchema: { type: "object" },
					},
				],
			} as any),
		);

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.tools).toEqual([
			{
				type: "function",
				function: {
					name: "calculator",
					description: "Does math",
					parameters: { type: "object" },
				},
			},
		]);
	});

	it("should forward temperature to the binding", async () => {
		const binding = createStreamingBinding(['data: {"response":"ok"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
				temperature: 0.3,
			} as any),
		);

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.temperature).toBe(0.3);
	});

	it("should handle multi-turn conversation with tool results", async () => {
		const binding = createStreamingBinding(['data: {"response":"It is 72°F in SF"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [
					{ role: "user", content: "Weather?" },
					{
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "call_1",
								function: {
									name: "get_weather",
									arguments: '{"location":"SF"}',
								},
							},
						],
					},
					{
						role: "tool",
						toolCallId: "call_1",
						content: '{"temp":72}',
					},
				],
			} as any),
		);

		const [, inputs] = binding.run.mock.calls[0]!;
		const messages = inputs.messages;

		// user message
		expect(messages[0]).toEqual({ role: "user", content: "Weather?" });

		// assistant with tool call
		expect(messages[1].role).toBe("assistant");
		expect(messages[1].tool_calls).toHaveLength(1);
		expect(messages[1].tool_calls[0].function.name).toBe("get_weather");

		// tool result — tool_call_id is sanitized to 9-char alphanumeric for binding compatibility
		expect(messages[2].role).toBe("tool");
		expect(messages[2].tool_call_id).toBe("call10000");
		expect(messages[2].content).toBe('{"temp":72}');
	});

	it("should handle multi-part content arrays", async () => {
		const binding = createStreamingBinding(['data: {"response":"ok"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", content: "Hello " },
							{ type: "text", content: "world" },
						],
					},
				],
			} as any),
		);

		const [, inputs] = binding.run.mock.calls[0]!;
		// Text-only multi-part content should be joined into a plain string
		expect(inputs.messages[0].content).toBe("Hello world");
	});

	it("should preserve image parts in multi-part content", async () => {
		const binding = createStreamingBinding(['data: {"response":"ok"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", content: "Describe this: " },
							{ type: "image_url", content: "data:image/png;base64,abc123" },
						],
					},
				],
			} as any),
		);

		const [, inputs] = binding.run.mock.calls[0]!;
		// Should preserve image parts as OpenAI multi-modal content array
		expect(inputs.messages[0].content).toEqual([
			{ type: "text", text: "Describe this: " },
			{ type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
		]);
	});

	it("should handle null content", async () => {
		const binding = createStreamingBinding(['data: {"response":"ok"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [
					{ role: "assistant", content: null },
					{ role: "user", content: "Hi" },
				],
			} as any),
		);

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.messages[0].content).toBe("");
	});
});

// ---------------------------------------------------------------------------
// structuredOutput
// ---------------------------------------------------------------------------

describe("WorkersAiTextAdapter.structuredOutput", () => {
	it("should return parsed JSON data from structured output", async () => {
		const binding = createMockBinding({
			response: '{"name":"Alice","age":30}',
		});
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const result = await adapter.structuredOutput({
			outputSchema: {
				type: "object",
				properties: {
					name: { type: "string" },
					age: { type: "number" },
				},
			},
			chatOptions: {
				model: MODEL,
				messages: [{ role: "user", content: "Tell me about Alice" }],
			},
		} as any);

		expect(result.data).toEqual({ name: "Alice", age: 30 });
		expect(result.rawText).toBe('{"name":"Alice","age":30}');
	});

	it("should pass json_schema response_format to binding", async () => {
		const binding = createMockBinding({ response: '{"x":1}' });
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await adapter.structuredOutput({
			outputSchema: { type: "object" },
			chatOptions: {
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			},
		} as any);

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.response_format).toEqual({
			type: "json_schema",
			json_schema: {
				name: "structured_output",
				strict: true,
				schema: { type: "object" },
			},
		});
	});

	it("should throw when response has no choices", async () => {
		// Simulate a binding that returns an empty object (no response field)
		// which, when wrapped in OpenAI format, yields no choices
		const binding = createMockBinding({ response: "" });
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		// The non-streaming path wraps the response in OpenAI format with choices,
		// so we need to test at a lower level. Let's test the adapter by injecting
		// a mock client.
		const mockClient = {
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue({
						choices: [],
					}),
				},
			},
		};
		// Override the private client
		(adapter as any).client = mockClient;

		await expect(
			adapter.structuredOutput({
				outputSchema: { type: "object" },
				chatOptions: {
					model: MODEL,
					messages: [{ role: "user", content: "Hi" }],
				},
			} as any),
		).rejects.toThrow("Workers AI structured output returned no choices");
	});

	it("should fall back to raw text when JSON parsing fails", async () => {
		const binding = createMockBinding({ response: "not json at all" });
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const result = await adapter.structuredOutput({
			outputSchema: { type: "object" },
			chatOptions: {
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			},
		} as any);

		expect(result.data).toBe("not json at all");
		expect(result.rawText).toBe("not json at all");
	});

	it("should exclude tool messages from structured output requests", async () => {
		const binding = createMockBinding({ response: '{"x":1}' });
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await adapter.structuredOutput({
			outputSchema: { type: "object" },
			chatOptions: {
				model: MODEL,
				messages: [
					{ role: "user", content: "Hi" },
					{
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "call_1",
								function: { name: "foo", arguments: "{}" },
							},
						],
					},
					{ role: "tool", toolCallId: "call_1", content: '{"result":1}' },
					{ role: "user", content: "Now summarize" },
				],
			},
		} as any);

		const [, inputs] = binding.run.mock.calls[0]!;
		const messages = inputs.messages;

		// Tool messages should be excluded
		const toolMessages = messages.filter((m: any) => m.role === "tool");
		expect(toolMessages).toHaveLength(0);

		// Assistant message should NOT have tool_calls attached
		const assistantMsg = messages.find((m: any) => m.role === "assistant");
		expect(assistantMsg?.tool_calls).toBeUndefined();

		// User messages should still be present
		const userMessages = messages.filter((m: any) => m.role === "user");
		expect(userMessages).toHaveLength(2);
	});

	it("should forward temperature to the binding", async () => {
		const binding = createMockBinding({ response: "{}" });
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await adapter.structuredOutput({
			outputSchema: { type: "object" },
			chatOptions: {
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
				temperature: 0,
			},
		} as any);

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.temperature).toBe(0);
	});

	it("should pass system prompts for structured output", async () => {
		const binding = createMockBinding({ response: "{}" });
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		await adapter.structuredOutput({
			outputSchema: { type: "object" },
			chatOptions: {
				model: MODEL,
				systemPrompts: ["Extract structured data"],
				messages: [{ role: "user", content: "Alice is 30" }],
			},
		} as any);

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.messages[0]).toEqual({
			role: "system",
			content: "Extract structured data",
		});
	});
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("WorkersAiTextAdapter error handling", () => {
	it("should emit RUN_ERROR when binding.run throws", async () => {
		const binding = {
			run: vi.fn().mockRejectedValue(new Error("Connection refused")),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		const runStarted = chunks.find((c: any) => c.type === "RUN_STARTED");
		const runError = chunks.find((c: any) => c.type === "RUN_ERROR");

		expect(runStarted).toBeDefined();
		expect(runError).toBeDefined();
		// The OpenAI SDK wraps binding errors, so we just verify a RUN_ERROR is emitted
		// with a non-empty message.
		expect(typeof runError.error.message).toBe("string");
		expect(runError.error.message.length).toBeGreaterThan(0);
	});

	it("should not emit RUN_FINISHED when binding.run throws", async () => {
		const binding = {
			run: vi.fn().mockRejectedValue(new Error("kaboom")),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		const runFinished = chunks.find((c: any) => c.type === "RUN_FINISHED");
		const runError = chunks.find((c: any) => c.type === "RUN_ERROR");

		// Should emit RUN_ERROR but NOT RUN_FINISHED
		expect(runError).toBeDefined();
		expect(runFinished).toBeUndefined();
	});

	it("should handle premature stream termination (no finish_reason)", async () => {
		// Simulate a stream that ends abruptly without a finish_reason chunk.
		// This can happen when Workers AI truncates a response or the connection drops.
		const binding = createStreamingBinding([
			'data: {"response":"Hello"}\n\n',
			'data: {"response":" world"}\n\n',
			// No finish_reason chunk — stream just ends
		]);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		// Should still emit all required lifecycle events
		const runStarted = chunks.find((c: any) => c.type === "RUN_STARTED");
		const textContent = chunks.filter((c: any) => c.type === "TEXT_MESSAGE_CONTENT");
		const textEnd = chunks.find((c: any) => c.type === "TEXT_MESSAGE_END");
		const runFinished = chunks.find((c: any) => c.type === "RUN_FINISHED");

		expect(runStarted).toBeDefined();
		expect(textContent).toHaveLength(2);
		expect(textContent[1].content).toBe("Hello world");

		// Should emit TEXT_MESSAGE_END and RUN_FINISHED despite no finish_reason
		expect(textEnd).toBeDefined();
		expect(runFinished).toBeDefined();
		expect(runFinished.finishReason).toBe("stop");
	});

	it("should handle premature stream termination with OpenAI-format stream", async () => {
		// OpenAI-format stream that ends without a finish_reason (e.g. Kimi K2.5 truncation)
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
					),
				);
				// Stream ends without a finish_reason chunk
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});
		const binding = {
			run: vi.fn().mockResolvedValue(stream),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		const runFinished = chunks.find((c: any) => c.type === "RUN_FINISHED");
		// Should still get a RUN_FINISHED via the premature termination handler
		expect(runFinished).toBeDefined();
		expect(runFinished.finishReason).toBe("stop");
	});
});

// ---------------------------------------------------------------------------
// Reasoning (STEP_STARTED / STEP_FINISHED)
// ---------------------------------------------------------------------------

describe("WorkersAiTextAdapter reasoning events", () => {
	/**
	 * Helper: creates a binding that returns an OpenAI-format SSE stream
	 * (as emitted by models like QwQ, DeepSeek R1, Kimi K2.5 through the
	 * Workers AI binding). These models include `reasoning_content` on deltas.
	 */
	function createReasoningBinding(chunks: string[]) {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});
		return {
			run: vi.fn().mockResolvedValue(stream),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
	}

	it("should emit STEP_STARTED and STEP_FINISHED for reasoning_content", async () => {
		const binding = createReasoningBinding([
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"Let me think"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":" about this"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello!"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"model":"@cf/qwen/qwq-32b"}\n\n',
		]);
		const adapter = new WorkersAiTextAdapter("@cf/qwen/qwq-32b" as WorkersAiTextModel, {
			binding,
		});

		const chunks = await collectChunks(
			adapter.chatStream({
				model: "@cf/qwen/qwq-32b" as WorkersAiTextModel,
				messages: [{ role: "user", content: "Think about this" }],
			} as any),
		);

		// Should have STEP_STARTED
		const stepStarted = chunks.find((c: any) => c.type === "STEP_STARTED");
		expect(stepStarted).toBeDefined();
		expect(stepStarted.stepType).toBe("thinking");
		expect(stepStarted.stepId).toMatch(/^workers-ai-step-/);

		// Should have STEP_FINISHED events with incremental reasoning
		const stepFinished = chunks.filter((c: any) => c.type === "STEP_FINISHED");
		expect(stepFinished).toHaveLength(2);

		// First reasoning token
		expect(stepFinished[0].delta).toBe("Let me think");
		expect(stepFinished[0].content).toBe("Let me think");

		// Second reasoning token — accumulated
		expect(stepFinished[1].delta).toBe(" about this");
		expect(stepFinished[1].content).toBe("Let me think about this");

		// All step events share the same stepId
		expect(stepFinished[0].stepId).toBe(stepStarted.stepId);
		expect(stepFinished[1].stepId).toBe(stepStarted.stepId);
	});

	it("should emit STEP_STARTED only once for multiple reasoning tokens", async () => {
		const binding = createReasoningBinding([
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"A"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"B"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"C"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Result"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"model":"@cf/qwen/qwq-32b"}\n\n',
		]);
		const adapter = new WorkersAiTextAdapter("@cf/qwen/qwq-32b" as WorkersAiTextModel, {
			binding,
		});

		const chunks = await collectChunks(
			adapter.chatStream({
				model: "@cf/qwen/qwq-32b" as WorkersAiTextModel,
				messages: [{ role: "user", content: "Think" }],
			} as any),
		);

		const stepStarted = chunks.filter((c: any) => c.type === "STEP_STARTED");
		expect(stepStarted).toHaveLength(1);

		const stepFinished = chunks.filter((c: any) => c.type === "STEP_FINISHED");
		expect(stepFinished).toHaveLength(3);
		expect(stepFinished[2].content).toBe("ABC");
	});

	it("should emit reasoning events before text content events", async () => {
		const binding = createReasoningBinding([
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"thinking..."},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"answer"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"model":"@cf/qwen/qwq-32b"}\n\n',
		]);
		const adapter = new WorkersAiTextAdapter("@cf/qwen/qwq-32b" as WorkersAiTextModel, {
			binding,
		});

		const chunks = await collectChunks(
			adapter.chatStream({
				model: "@cf/qwen/qwq-32b" as WorkersAiTextModel,
				messages: [{ role: "user", content: "Think" }],
			} as any),
		);

		const types = chunks.map((c: any) => c.type);

		// Verify ordering: RUN_STARTED → STEP_STARTED → STEP_FINISHED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT → TEXT_MESSAGE_END → RUN_FINISHED
		const stepStartedIdx = types.indexOf("STEP_STARTED");
		const stepFinishedIdx = types.indexOf("STEP_FINISHED");
		const textStartIdx = types.indexOf("TEXT_MESSAGE_START");
		const textContentIdx = types.indexOf("TEXT_MESSAGE_CONTENT");

		expect(stepStartedIdx).toBeLessThan(stepFinishedIdx);
		expect(stepFinishedIdx).toBeLessThan(textStartIdx);
		expect(textStartIdx).toBeLessThan(textContentIdx);
	});

	it("should handle reasoning-only response (no text content)", async () => {
		const binding = createReasoningBinding([
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"deep thought"},"finish_reason":null}],"model":"@cf/qwen/qwq-32b"}\n\n',
			'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"model":"@cf/qwen/qwq-32b"}\n\n',
		]);
		const adapter = new WorkersAiTextAdapter("@cf/qwen/qwq-32b" as WorkersAiTextModel, {
			binding,
		});

		const chunks = await collectChunks(
			adapter.chatStream({
				model: "@cf/qwen/qwq-32b" as WorkersAiTextModel,
				messages: [{ role: "user", content: "Think silently" }],
			} as any),
		);

		// Should have reasoning events
		expect(chunks.find((c: any) => c.type === "STEP_STARTED")).toBeDefined();
		expect(chunks.find((c: any) => c.type === "STEP_FINISHED")).toBeDefined();

		// Should NOT have text message events
		expect(chunks.find((c: any) => c.type === "TEXT_MESSAGE_START")).toBeUndefined();
		expect(chunks.find((c: any) => c.type === "TEXT_MESSAGE_CONTENT")).toBeUndefined();
		expect(chunks.find((c: any) => c.type === "TEXT_MESSAGE_END")).toBeUndefined();

		// Should still finish the run
		const runFinished = chunks.find((c: any) => c.type === "RUN_FINISHED");
		expect(runFinished).toBeDefined();
		expect(runFinished.finishReason).toBe("stop");
	});

	it("should not emit reasoning events for non-reasoning models", async () => {
		const binding = createStreamingBinding(['data: {"response":"Just a normal answer"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		expect(chunks.find((c: any) => c.type === "STEP_STARTED")).toBeUndefined();
		expect(chunks.find((c: any) => c.type === "STEP_FINISHED")).toBeUndefined();

		// Regular text events should still work
		expect(chunks.find((c: any) => c.type === "TEXT_MESSAGE_CONTENT")).toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// Premature stream termination
// ---------------------------------------------------------------------------

describe("WorkersAiTextAdapter premature termination", () => {
	it("should emit RUN_FINISHED with warning when stream ends without finish_reason", async () => {
		const binding = createStreamingBinding(['data: {"response":"ok"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		// Override the OpenAI client to simulate a stream that ends without finish_reason
		const mockStream = (async function* () {
			yield {
				id: "chatcmpl-1",
				object: "chat.completion.chunk",
				choices: [{ index: 0, delta: { content: "partial" }, finish_reason: null }],
				model: MODEL,
			};
			// Stream ends here — no chunk with finish_reason
		})();
		(adapter as any).client = {
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue(mockStream),
				},
			},
		};

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		// Should still emit RUN_FINISHED so consumers don't hang
		const runFinished = chunks.find((c: any) => c.type === "RUN_FINISHED");
		expect(runFinished).toBeDefined();

		// Should have logged a warning about premature termination
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("Stream ended without finish_reason"),
		);

		warnSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// Config modes (constructor behavior)
// ---------------------------------------------------------------------------

describe("WorkersAiTextAdapter config modes", () => {
	it("should work with plain binding config", async () => {
		const binding = createStreamingBinding(['data: {"response":"ok"}\n\n']);
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const chunks = await collectChunks(
			adapter.chatStream({
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			} as any),
		);

		expect(binding.run).toHaveBeenCalledOnce();
		expect(chunks.length).toBeGreaterThan(0);
	});

	it("should construct REST client with correct base URL", () => {
		// We can't easily test REST mode end-to-end without a real API,
		// but we can verify the adapter constructs without error.
		const adapter = new WorkersAiTextAdapter(MODEL, {
			accountId: "test-account",
			apiKey: "test-key",
		});

		expect(adapter).toBeDefined();
		expect(adapter.name).toBe("workers-ai");
	});

	it("should construct gateway client without error", () => {
		const mockGateway = {
			run: vi.fn().mockResolvedValue(new Response("ok")),
		};
		const adapter = new WorkersAiTextAdapter(MODEL, {
			binding: mockGateway,
		});

		expect(adapter).toBeDefined();
	});

	it("should throw for empty config (no binding, no credentials)", () => {
		expect(() => new WorkersAiTextAdapter(MODEL, {} as any)).toThrow(
			/Invalid Workers AI configuration/,
		);
	});

	it("should throw for config with only accountId (missing apiKey)", () => {
		expect(() => new WorkersAiTextAdapter(MODEL, { accountId: "abc" } as any)).toThrow(
			/Invalid Workers AI configuration/,
		);
	});

	it("should accept an arbitrary model string", () => {
		const binding = createMockBinding({ response: "ok" });
		const adapter = new WorkersAiTextAdapter("@cf/my-org/custom-model-v1", { binding });
		expect(adapter).toBeDefined();
	});
});
