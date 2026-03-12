/**
 * Tests for the shared message-building helpers in workers-ai.ts.
 *
 * These are private functions, so we test them indirectly by constructing a
 * WorkersAiTextAdapter with a mock binding and inspecting what messages get
 * passed to binding.run().
 */
import { describe, expect, it, vi } from "vitest";

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

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as WorkersAiTextModel;

function createBinding() {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode('data: {"response":"ok"}\n\n'));
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});
	return {
		run: vi.fn().mockResolvedValue(stream),
		gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
	};
}

async function getMessages(adapter: WorkersAiTextAdapter<any>, options: any, binding: any) {
	const chunks: any[] = [];
	for await (const chunk of adapter.chatStream(options)) {
		chunks.push(chunk);
	}
	const [, inputs] = binding.run.mock.calls[0]!;
	return inputs.messages;
}

// ---------------------------------------------------------------------------
// buildOpenAIMessages (tested through chatStream)
// ---------------------------------------------------------------------------

describe("message building (via chatStream)", () => {
	it("should convert system prompts into a single system message", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				systemPrompts: ["First instruction", "Second instruction"],
				messages: [{ role: "user", content: "Hi" }],
			},
			binding,
		);

		expect(messages[0]).toEqual({
			role: "system",
			content: "First instruction\nSecond instruction",
		});
	});

	it("should omit system message when no prompts are provided", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [{ role: "user", content: "Hi" }],
			},
			binding,
		);

		expect(messages[0].role).toBe("user");
	});

	it("should omit system message for empty prompts array", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				systemPrompts: [],
				messages: [{ role: "user", content: "Hi" }],
			},
			binding,
		);

		expect(messages[0].role).toBe("user");
	});

	it("should convert user string content", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [{ role: "user", content: "Hello there" }],
			},
			binding,
		);

		expect(messages[0]).toEqual({ role: "user", content: "Hello there" });
	});

	it("should convert image URL source to OpenAI image_url format", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", content: "Part 1" },
							{
								type: "image",
								source: { type: "url", value: "https://example.com/img.png" },
							},
							{ type: "text", content: " Part 2" },
						],
					},
				],
			},
			binding,
		);

		// Should preserve image parts as OpenAI multi-modal content array
		expect(messages[0].content).toEqual([
			{ type: "text", text: "Part 1" },
			{ type: "image_url", image_url: { url: "https://example.com/img.png" } },
			{ type: "text", text: " Part 2" },
		]);
	});

	it("should convert image data source to data URI in OpenAI format", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", content: "Describe this" },
							{
								type: "image",
								source: {
									type: "data",
									value: "abc123",
									mimeType: "image/png",
								},
							},
						],
					},
				],
			},
			binding,
		);

		expect(messages[0].content).toEqual([
			{ type: "text", text: "Describe this" },
			{ type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
		]);
	});

	it("should return plain string for text-only multi-part content", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", content: "Hello" },
							{ type: "text", content: " world" },
						],
					},
				],
			},
			binding,
		);

		expect(messages[0].content).toBe("Hello world");
	});

	it("should handle null content as empty string", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{ role: "assistant", content: null },
					{ role: "user", content: "Hi" },
				],
			},
			binding,
		);

		expect(messages[0].content).toBe("");
	});

	it("should include assistant tool_calls in messages", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "callabc00",
								function: {
									name: "search",
									arguments: '{"q":"test"}',
								},
							},
						],
					},
					{ role: "user", content: "continue" },
				],
			},
			binding,
		);

		expect(messages[0].role).toBe("assistant");
		expect(messages[0].tool_calls).toHaveLength(1);
		expect(messages[0].tool_calls[0]).toEqual({
			id: "callabc00",
			type: "function",
			function: { name: "search", arguments: '{"q":"test"}' },
		});
	});

	it("should convert tool result messages with valid JSON content", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "call_1",
								function: { name: "fn", arguments: "{}" },
							},
						],
					},
					{
						role: "tool",
						toolCallId: "call_1",
						content: '{"result":"success"}',
					},
					{ role: "user", content: "Done?" },
				],
			},
			binding,
		);

		const toolMsg = messages.find((m: any) => m.role === "tool");
		// tool_call_id is sanitized to 9-char alphanumeric for binding compatibility
		expect(toolMsg.tool_call_id).toBe("call10000");
		// Valid JSON string should be passed through as-is
		expect(toolMsg.content).toBe('{"result":"success"}');
	});

	it("should JSON-stringify non-JSON tool result strings", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "call_1",
								function: { name: "fn", arguments: "{}" },
							},
						],
					},
					{
						role: "tool",
						toolCallId: "call_1",
						content: "plain text result",
					},
					{ role: "user", content: "Done?" },
				],
			},
			binding,
		);

		const toolMsg = messages.find((m: any) => m.role === "tool");
		// Non-JSON strings get JSON.stringify'd (adds quotes)
		expect(toolMsg.content).toBe('"plain text result"');
	});

	it("should JSON-stringify non-string tool result content", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "call_1",
								function: { name: "fn", arguments: "{}" },
							},
						],
					},
					{
						role: "tool",
						toolCallId: "call_1",
						content: [{ type: "text", content: "structured" }],
					},
					{ role: "user", content: "Done?" },
				],
			},
			binding,
		);

		const toolMsg = messages.find((m: any) => m.role === "tool");
		expect(toolMsg.content).toBe('[{"type":"text","content":"structured"}]');
	});

	it("should use empty string for missing toolCallId", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		const messages = await getMessages(
			adapter,
			{
				model: MODEL,
				messages: [
					{
						role: "assistant",
						content: "",
						toolCalls: [
							{
								id: "call_1",
								function: { name: "fn", arguments: "{}" },
							},
						],
					},
					{
						role: "tool",
						// no toolCallId
						content: '{"ok":true}',
					},
					{ role: "user", content: "Done?" },
				],
			},
			binding,
		);

		const toolMsg = messages.find((m: any) => m.role === "tool");
		// When toolCallId is missing, the adapter generates a fallback ID (tool_<uuid>),
		// which then gets sanitized by the binding shim (strips underscore, truncates to 9 chars).
		expect(toolMsg.tool_call_id).toMatch(/^tool[a-f0-9]{5}$/);
	});
});

// ---------------------------------------------------------------------------
// buildOpenAITools (tested through chatStream)
// ---------------------------------------------------------------------------

describe("tool building (via chatStream)", () => {
	it("should convert tools to OpenAI format", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		for await (const _ of adapter.chatStream({
			model: MODEL,
			messages: [{ role: "user", content: "Hi" }],
			tools: [
				{
					name: "search",
					description: "Search the web",
					inputSchema: {
						type: "object",
						properties: { query: { type: "string" } },
					},
				},
				{
					name: "calculate",
					description: "Do math",
					inputSchema: { type: "object" },
				},
			],
		} as any)) {
			// consume the stream
		}

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.tools).toEqual([
			{
				type: "function",
				function: {
					name: "search",
					description: "Search the web",
					parameters: {
						type: "object",
						properties: { query: { type: "string" } },
					},
				},
			},
			{
				type: "function",
				function: {
					name: "calculate",
					description: "Do math",
					parameters: { type: "object" },
				},
			},
		]);
	});

	it("should not pass tools when none are provided", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		for await (const _ of adapter.chatStream({
			model: MODEL,
			messages: [{ role: "user", content: "Hi" }],
		} as any)) {
			// consume
		}

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.tools).toBeUndefined();
	});

	it("should handle tools with no inputSchema", async () => {
		const binding = createBinding();
		const adapter = new WorkersAiTextAdapter(MODEL, { binding });

		for await (const _ of adapter.chatStream({
			model: MODEL,
			messages: [{ role: "user", content: "Hi" }],
			tools: [
				{
					name: "ping",
					description: "Ping",
					// no inputSchema
				},
			],
		} as any)) {
			// consume
		}

		const [, inputs] = binding.run.mock.calls[0]!;
		expect(inputs.tools[0].function.name).toBe("ping");
		expect(inputs.tools[0].function.parameters).toBeUndefined();
	});
});
