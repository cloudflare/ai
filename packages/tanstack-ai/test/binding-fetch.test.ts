import { describe, expect, it, vi, type Mock } from "vitest";
import { createWorkersAiBindingFetch, type WorkersAiBinding } from "../src/utils/create-fetcher";

type MockBinding = WorkersAiBinding & { run: Mock };

/** Creates a mock WorkersAiBinding with the required `gateway` method. */
function mockBinding(runImpl: ReturnType<typeof vi.fn>): MockBinding {
	return { run: runImpl, gateway: vi.fn() } as unknown as MockBinding;
}

// ---------------------------------------------------------------------------
// createWorkersAiBindingFetch (binding shim)
// ---------------------------------------------------------------------------

describe("createWorkersAiBindingFetch", () => {
	it("should translate non-streaming request to OpenAI-compatible response", async () => {
		const binding = mockBinding(
			vi.fn().mockResolvedValue({ response: "Hello from Workers AI!" }),
		);

		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
				temperature: 0.7,
			}),
		});

		// Check binding was called correctly
		expect(binding.run).toHaveBeenCalledOnce();
		const [model, inputs] = binding.run.mock.calls[0]!;
		expect(model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
		expect(inputs.messages).toEqual([{ role: "user", content: "Hi" }]);
		expect(inputs.temperature).toBe(0.7);
		expect(inputs.stream).toBeUndefined();

		// Check response is OpenAI-compatible
		const json = (await response.json()) as {
			choices: Array<{
				message: { content: string; role: string };
				finish_reason: string;
			}>;
		};
		expect(json.choices[0]!.message.content).toBe("Hello from Workers AI!");
		expect(json.choices[0]!.message.role).toBe("assistant");
		expect(json.choices[0]!.finish_reason).toBe("stop");
	});

	it("should handle tool calls in non-streaming response", async () => {
		const binding = mockBinding(
			vi.fn().mockResolvedValue({
				response: "",
				tool_calls: [
					{
						name: "get_weather",
						arguments: { location: "San Francisco" },
					},
				],
			}),
		);

		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "What's the weather in SF?" }],
				tools: [
					{
						type: "function",
						function: { name: "get_weather", parameters: {} },
					},
				],
			}),
		});

		const json = (await response.json()) as {
			choices: Array<{
				message: {
					role: string;
					content: string;
					tool_calls?: Array<{
						id: string;
						type: string;
						function: { name: string; arguments: string };
					}>;
				};
				finish_reason: string;
			}>;
		};
		expect(json.choices[0]!.finish_reason).toBe("tool_calls");
		expect(json.choices[0]!.message.tool_calls).toHaveLength(1);
		expect(json.choices[0]!.message.tool_calls![0]!.function.name).toBe("get_weather");
		expect(JSON.parse(json.choices[0]!.message.tool_calls![0]!.function.arguments)).toEqual({
			location: "San Francisco",
		});
	});

	it("should translate streaming request and return SSE response", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"response":"Hello"}\n\n'));
				controller.enqueue(encoder.encode('data: {"response":" world"}\n\n'));
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const binding = mockBinding(vi.fn().mockResolvedValue(stream));

		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
				stream: true,
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");

		// Read the transformed stream
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}

		// Should contain OpenAI-formatted SSE events
		expect(text).toContain('"object":"chat.completion.chunk"');
		expect(text).toContain('"content":"Hello"');
		expect(text).toContain('"content":" world"');
		expect(text).toContain('"finish_reason":"stop"');

		// Should contain exactly one [DONE] (not duplicated)
		const doneCount = (text.match(/data: \[DONE\]/g) || []).length;
		expect(doneCount).toBe(1);
	});

	it("should use stable stream ID across all chunks", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"response":"Hello"}\n\n'));
				controller.enqueue(encoder.encode('data: {"response":" world"}\n\n'));
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const binding = mockBinding(vi.fn().mockResolvedValue(stream));

		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
				stream: true,
			}),
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}

		// Extract all IDs from the SSE events
		const ids = [...text.matchAll(/"id":"(workers-ai-[^"]+)"/g)].map((m) => m[1]);
		expect(ids.length).toBeGreaterThanOrEqual(3); // 2 content chunks + 1 finish chunk
		// All IDs should be identical
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(1);
	});

	it("should handle tool calls in streaming response", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						'data: {"response":"","tool_calls":[{"name":"add","arguments":{"a":1,"b":2}}]}\n\n',
					),
				);
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const binding = mockBinding(vi.fn().mockResolvedValue(stream));

		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [],
				stream: true,
				tools: [
					{
						type: "function",
						function: { name: "add", parameters: {} },
					},
				],
			}),
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}

		// Should contain tool call delta
		expect(text).toContain('"tool_calls"');
		expect(text).toContain('"name":"add"');
		// Finish reason should be tool_calls
		expect(text).toContain('"finish_reason":"tool_calls"');
	});

	it("should pass tools to binding when provided", async () => {
		const binding = mockBinding(vi.fn().mockResolvedValue({ response: "ok" }));

		const fetcher = createWorkersAiBindingFetch(binding);

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [],
				tools: [
					{
						type: "function",
						function: { name: "add", parameters: {} },
					},
				],
			}),
		});

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.tools).toEqual([
			{ type: "function", function: { name: "add", parameters: {} } },
		]);
	});

	it("should normalize null content to empty string in messages", async () => {
		const binding = mockBinding(vi.fn().mockResolvedValue({ response: "ok" }));
		const fetcher = createWorkersAiBindingFetch(binding);

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [
					{ role: "user", content: "hi" },
					{
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_abc",
								type: "function",
								function: { name: "fn", arguments: "{}" },
							},
						],
					},
					{ role: "tool", tool_call_id: "call_abc", content: '{"ok":true}' },
				],
			}),
		});

		const [, inputs] = binding.run.mock.calls[0]!;
		const messages = inputs.messages as Array<Record<string, unknown>>;
		// content: null should become content: ""
		expect(messages[1]!.content).toBe("");
		// tool_call_id should be passed through as-is
		expect(messages[2]!.tool_call_id).toBe("call_abc");
		// assistant's tool_calls[].id should also be passed through as-is
		expect((messages[1]!.tool_calls as Array<Record<string, unknown>>)[0]!.id).toBe("call_abc");
	});

	it("should pass through tool_call_id with dashes unchanged", async () => {
		const binding = mockBinding(vi.fn().mockResolvedValue({ response: "ok" }));
		const fetcher = createWorkersAiBindingFetch(binding);

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [
					{ role: "user", content: "hi" },
					{
						role: "assistant",
						content: "",
						tool_calls: [
							{
								id: "chatcmpl-tool-875d3ec6179676ae",
								type: "function",
								function: { name: "fn", arguments: "{}" },
							},
						],
					},
					{
						role: "tool",
						tool_call_id: "chatcmpl-tool-875d3ec6179676ae",
						content: "result",
					},
				],
			}),
		});

		const [, inputs] = binding.run.mock.calls[0]!;
		const messages = inputs.messages as Array<Record<string, unknown>>;
		expect(messages[1]!.tool_calls).toBeDefined();
		const assistantToolId = (messages[1]!.tool_calls as Array<Record<string, unknown>>)[0]!.id;
		const toolMsgId = messages[2]!.tool_call_id;
		// IDs should be passed through unchanged
		expect(assistantToolId).toBe("chatcmpl-tool-875d3ec6179676ae");
		expect(toolMsgId).toBe("chatcmpl-tool-875d3ec6179676ae");
	});

	it("should handle streaming tool calls in nested format (real binding format)", async () => {
		// This mimics the actual Workers AI binding stream format for tool calls:
		// Chunk 1: { tool_calls: [{ id, type, index, function: { name } }] }
		// Chunk 2: { tool_calls: [{ index, function: { arguments: "partial" } }] }
		// Chunk 3: { tool_calls: [{ index, function: { arguments: "rest" } }] }
		// Chunk 4: { tool_calls: [{ id: null, type: null, index, function: { name: null, arguments: "" } }] }  (finalize, skip)
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"response":"","tool_calls":[]}\n\n'));
				controller.enqueue(
					encoder.encode(
						'data: {"tool_calls":[{"id":"chatcmpl-tool-abc123","type":"function","index":0,"function":{"name":"calculator"}}]}\n\n',
					),
				);
				controller.enqueue(
					encoder.encode(
						'data: {"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\": 1"}}]}\n\n',
					),
				);
				controller.enqueue(
					encoder.encode(
						'data: {"tool_calls":[{"index":0,"function":{"arguments":", \\"b\\": 2}"}}]}\n\n',
					),
				);
				controller.enqueue(
					encoder.encode(
						'data: {"tool_calls":[{"id":null,"type":null,"index":0,"function":{"name":null,"arguments":""}}]}\n\n',
					),
				);
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const binding = mockBinding(vi.fn().mockResolvedValue(stream));
		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "1+2?" }],
				stream: true,
				tools: [
					{
						type: "function",
						function: { name: "calculator", parameters: {} },
					},
				],
			}),
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}

		// Should contain tool call with correct name
		expect(text).toContain('"name":"calculator"');
		// Should contain streamed arguments
		expect(text).toContain('"arguments":"{\\"a\\": 1"');
		expect(text).toContain('"arguments":", \\"b\\": 2}"');
		// Finish reason should be tool_calls
		expect(text).toContain('"finish_reason":"tool_calls"');
		// Parse all SSE events and verify tool call chunks are well-formed
		const events = text.split("data: ").filter((e) => e.trim() && e.trim() !== "[DONE]");
		const toolCallEvents = events
			.map((e) => {
				try {
					return JSON.parse(e.replace(/\n+$/, ""));
				} catch {
					return null;
				}
			})
			.filter((e) => e?.choices?.[0]?.delta?.tool_calls);
		// Should have at least 3 chunks: start (id+name), args part 1, args part 2
		expect(toolCallEvents.length).toBeGreaterThanOrEqual(3);
		// First tool call chunk should have id, type, and name
		const firstTc = toolCallEvents[0].choices[0].delta.tool_calls[0];
		expect(firstTc.id).toBe("chatcmpl-tool-abc123");
		expect(firstTc.type).toBe("function");
		expect(firstTc.function.name).toBe("calculator");
	});

	it("should pass through OpenAI-format streams (Qwen3/Kimi-style binding output)", async () => {
		// Some models (Qwen3, Kimi K2.5) stream in OpenAI-compatible format through
		// the binding, with `choices[].delta.content` instead of `response`.
		// The transformer should detect this and pass through as-is.
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						'data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"thinking..."},"finish_reason":null}]}\n\n',
					),
				);
				controller.enqueue(
					encoder.encode(
						'data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
					),
				);
				controller.enqueue(
					encoder.encode(
						'data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}\n\n',
					),
				);
				controller.enqueue(
					encoder.encode(
						'data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
					),
				);
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const binding = mockBinding(vi.fn().mockResolvedValue(stream));
		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/qwen/qwen3-30b-a3b-fp8",
				messages: [{ role: "user", content: "Hi" }],
				stream: true,
			}),
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}

		// Should preserve the original OpenAI-format content
		expect(text).toContain('"content":"Hello"');
		expect(text).toContain('"content":" world"');
		expect(text).toContain('"reasoning_content":"thinking..."');
		// Should include the original finish reason from the stream
		expect(text).toContain('"finish_reason":"stop"');
		// Should NOT contain a workers-ai-* id (passthrough keeps original id)
		expect(text).toContain('"id":"chatcmpl-abc"');
		expect(text).not.toContain("workers-ai-");
		// Should have exactly one [DONE]
		const doneCount = (text.match(/data: \[DONE\]/g) || []).length;
		expect(doneCount).toBe(1);
	});

	it("should return 400 when no body is provided", async () => {
		const binding = mockBinding(vi.fn());
		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
		});

		expect(response.status).toBe(400);
		expect(binding.run).not.toHaveBeenCalled();
	});

	it("should handle non-streaming fallback (model ignores stream: true)", async () => {
		// Some models return a complete response even when stream: true is requested.
		// The binding shim should gracefully wrap it as an OpenAI Chat Completion.
		const binding = mockBinding(
			vi.fn().mockResolvedValue({ response: "I don't stream, sorry!" }),
		);

		const fetcher = createWorkersAiBindingFetch(binding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
				stream: true,
			}),
		});

		// Should get a valid JSON response (not SSE), since the model didn't stream
		expect(response.headers.get("Content-Type")).toBe("application/json");

		const json = (await response.json()) as {
			choices: Array<{
				message: { content: string; role: string };
				finish_reason: string;
			}>;
		};
		expect(json.choices[0]!.message.content).toBe("I don't stream, sorry!");
		expect(json.choices[0]!.finish_reason).toBe("stop");
	});

	it("should forward extraHeaders to binding.run() when configured", async () => {
		const binding = mockBinding(vi.fn().mockResolvedValue({ response: "ok" }));

		const fetcher = createWorkersAiBindingFetch(binding, {
			extraHeaders: { "x-session-affinity": "session-123" },
		});

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
			}),
		});

		expect(binding.run).toHaveBeenCalledOnce();
		const [, , options] = binding.run.mock.calls[0]!;
		expect(options).toEqual({ extraHeaders: { "x-session-affinity": "session-123" } });
	});

	it("should not pass extraHeaders to binding.run() when not configured", async () => {
		const binding = mockBinding(vi.fn().mockResolvedValue({ response: "ok" }));

		const fetcher = createWorkersAiBindingFetch(binding);

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
			}),
		});

		expect(binding.run).toHaveBeenCalledOnce();
		const [, , options] = binding.run.mock.calls[0]!;
		expect(options).toBeUndefined();
	});

	it("should pass response_format to binding for structured output", async () => {
		const binding = mockBinding(vi.fn().mockResolvedValue({ response: '{"name":"test"}' }));

		const fetcher = createWorkersAiBindingFetch(binding);

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [],
				response_format: {
					type: "json_schema",
					json_schema: { name: "test", schema: {} },
				},
			}),
		});

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.response_format).toEqual({
			type: "json_schema",
			json_schema: { name: "test", schema: {} },
		});
	});

	it("should pass content arrays through to binding for vision models", async () => {
		const binding = mockBinding(vi.fn().mockResolvedValue({ response: "A red square" }));

		const fetcher = createWorkersAiBindingFetch(binding);

		const base64 = btoa("fake-png-bytes");

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-4-scout-17b-16e-instruct",
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "Describe this" },
							{
								type: "image_url",
								image_url: { url: `data:image/png;base64,${base64}` },
							},
						],
					},
				],
			}),
		});

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.messages[0].content).toEqual([
			{ type: "text", text: "Describe this" },
			{ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
		]);
	});
});
