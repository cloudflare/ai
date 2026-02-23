import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
	processPartialToolCalls,
	processToolCalls,
	processText,
	sanitizeToolCallId,
	normalizeMessagesForBinding,
	prepareToolsAndToolChoice,
	createRun,
} from "../src/utils";

// ---------------------------------------------------------------------------
// sanitizeToolCallId
// ---------------------------------------------------------------------------

describe("sanitizeToolCallId", () => {
	it("should strip non-alphanumeric characters and truncate to 9 chars", () => {
		expect(sanitizeToolCallId("chatcmpl-tool-875d3ec6179676ae")).toBe("chatcmplt");
	});

	it("should pad short IDs with zeros", () => {
		expect(sanitizeToolCallId("abc")).toBe("abc000000");
	});

	it("should pass through already-valid 9-char alphanumeric IDs", () => {
		expect(sanitizeToolCallId("abcdef123")).toBe("abcdef123");
	});

	it("should handle empty string", () => {
		expect(sanitizeToolCallId("")).toBe("000000000");
	});

	it("should handle IDs with only special characters", () => {
		expect(sanitizeToolCallId("---!!!---")).toBe("000000000");
	});

	it("should handle mixed content", () => {
		expect(sanitizeToolCallId("call_abc_123")).toBe("callabc12");
	});
});

// ---------------------------------------------------------------------------
// normalizeMessagesForBinding
// ---------------------------------------------------------------------------

describe("normalizeMessagesForBinding", () => {
	it("should pass through normal messages unchanged", () => {
		const messages = [
			{ role: "system" as const, content: "You are helpful" },
			{ role: "user" as const, content: "Hello" },
		];
		const result = normalizeMessagesForBinding(messages);
		expect(result).toEqual(messages);
	});

	it("should sanitize tool_call_id on tool messages", () => {
		const messages = [
			{
				role: "tool" as const,
				name: "get_weather",
				content: '{"temp": 72}',
				tool_call_id: "chatcmpl-tool-875d3ec6179676ae",
			},
		];
		const result = normalizeMessagesForBinding(messages);
		expect(result[0]).toHaveProperty("tool_call_id", "chatcmplt");
	});

	it("should sanitize tool_calls[].id on assistant messages", () => {
		const messages = [
			{
				role: "assistant" as const,
				content: "",
				tool_calls: [
					{
						id: "chatcmpl-tool-abc123def456",
						type: "function" as const,
						function: { name: "calc", arguments: "{}" },
					},
				],
			},
		];
		const result = normalizeMessagesForBinding(messages);
		const assistant = result[0] as {
			tool_calls?: Array<{ id: string }>;
		};
		expect(assistant.tool_calls?.[0].id).toBe("chatcmplt");
	});

	it("should not mutate the original messages array", () => {
		const original = [
			{
				role: "tool" as const,
				name: "fn",
				content: "result",
				tool_call_id: "chatcmpl-tool-abc",
			},
		];
		const originalId = original[0].tool_call_id;
		normalizeMessagesForBinding(original);
		expect(original[0].tool_call_id).toBe(originalId);
	});
});

// ---------------------------------------------------------------------------
// processPartialToolCalls
// ---------------------------------------------------------------------------

describe("processPartialToolCalls", () => {
	it("should merge partial tool calls by index", () => {
		const partialCalls = [
			{
				function: { arguments: '{"par', name: "test_func" },
				id: "call_123",
				index: 0,
				type: "function",
			},
			{
				function: { arguments: 'am": "val' },
				index: 0,
			},
			{
				function: { arguments: 'ue"}' },
				index: 0,
			},
		];
		const result = processPartialToolCalls(partialCalls);
		expect(result).toHaveLength(1);
		expect(result[0].input).toBe('{"param": "value"}');
		expect(result[0].toolName).toBe("test_func");
		expect(result[0].toolCallId).toBe("call_123");
	});

	it("should handle multiple partial tool calls with different indices", () => {
		const partialCalls = [
			{
				function: { arguments: '{"a":', name: "func1" },
				id: "call_1",
				index: 0,
			},
			{
				function: { arguments: '{"b":', name: "func2" },
				id: "call_2",
				index: 1,
			},
			{
				function: { arguments: '"value1"}' },
				index: 0,
			},
			{
				function: { arguments: '"value2"}' },
				index: 1,
			},
		];

		const result = processPartialToolCalls(partialCalls);
		expect(result).toHaveLength(2);

		const call1 = result.find((call) => call.toolCallId === "call_1");
		const call2 = result.find((call) => call.toolCallId === "call_2");

		expect(call1?.input).toBe('{"a":"value1"}');
		expect(call2?.input).toBe('{"b":"value2"}');
	});
});

// ---------------------------------------------------------------------------
// processToolCalls
// ---------------------------------------------------------------------------

describe("processToolCalls", () => {
	it("should process OpenAI format tool calls", () => {
		const output = {
			tool_calls: [
				{
					function: {
						arguments: '{"param": "value"}',
						name: "test_function",
					},
					id: "call_123",
					type: "function",
				},
			],
		};

		const result = processToolCalls(output);
		expect(result).toEqual([
			{
				input: '{"param": "value"}',
				toolCallId: "call_123",
				toolName: "test_function",
				type: "tool-call",
			},
		]);
	});

	it("should handle tool calls with object arguments", () => {
		const output = {
			tool_calls: [
				{
					function: {
						arguments: { param: "value" },
						name: "test_function",
					},
					id: "call_123",
					type: "function",
				},
			],
		};

		const result = processToolCalls(output);
		expect(result[0].input).toBe('{"param":"value"}');
	});

	it("should handle tool calls without function wrapper", () => {
		const output = {
			tool_calls: [
				{
					arguments: '{"param": "value"}',
					name: "test_function",
					id: "call_123",
				},
			],
		};

		const result = processToolCalls(output);
		expect(result).toEqual([
			{
				input: '{"param": "value"}',
				toolCallId: "call_123",
				toolName: "test_function",
				type: "tool-call",
			},
		]);
	});

	it("should return empty array when no tool calls present", () => {
		expect(processToolCalls({})).toEqual([]);
		expect(processToolCalls({ tool_calls: null })).toEqual([]);
		expect(processToolCalls({ tool_calls: [] })).toEqual([]);
	});

	it("should handle undefined or null arguments", () => {
		const output = {
			tool_calls: [
				{
					function: {
						arguments: null,
						name: "test_function",
					},
					id: "call_123",
				},
			],
		};

		const result = processToolCalls(output);
		expect(result[0].input).toBe("{}");
	});

	it("should extract tool calls from OpenAI choices format", () => {
		const output = {
			choices: [
				{
					message: {
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
				},
			],
		};

		const result = processToolCalls(output);
		expect(result).toHaveLength(1);
		expect(result[0].toolName).toBe("get_weather");
		expect(result[0].toolCallId).toBe("call_abc");
		expect(result[0].input).toBe('{"city": "London"}');
	});
});

// ---------------------------------------------------------------------------
// prepareToolsAndToolChoice
// ---------------------------------------------------------------------------

describe("prepareToolsAndToolChoice", () => {
	const sampleTools: Parameters<typeof prepareToolsAndToolChoice>[0] = [
		{
			type: "function",
			name: "get_weather",
			description: "Get weather info",
			inputSchema: {
				type: "object",
				properties: { city: { type: "string" } },
			},
		},
		{
			type: "function",
			name: "calculator",
			description: "Calculate math",
			inputSchema: {
				type: "object",
				properties: { expression: { type: "string" } },
			},
		},
	];

	it("should return undefined tools and tool_choice when tools is null", () => {
		const result = prepareToolsAndToolChoice(undefined, undefined);
		expect(result.tools).toBeUndefined();
		expect(result.tool_choice).toBeUndefined();
	});

	it("should map tools to function format", () => {
		const result = prepareToolsAndToolChoice(sampleTools, undefined);
		expect(result.tools).toHaveLength(2);
		expect(result.tools![0]).toEqual({
			type: "function",
			function: {
				name: "get_weather",
				description: "Get weather info",
				parameters: {
					type: "object",
					properties: { city: { type: "string" } },
				},
			},
		});
		expect(result.tool_choice).toBeUndefined();
	});

	it("should handle 'auto' tool choice", () => {
		const result = prepareToolsAndToolChoice(sampleTools, { type: "auto" });
		expect(result.tool_choice).toBe("auto");
		expect(result.tools).toHaveLength(2);
	});

	it("should handle 'none' tool choice", () => {
		const result = prepareToolsAndToolChoice(sampleTools, { type: "none" });
		expect(result.tool_choice).toBe("none");
		expect(result.tools).toHaveLength(2);
	});

	it("should handle 'required' tool choice by mapping to 'any'", () => {
		const result = prepareToolsAndToolChoice(sampleTools, { type: "required" });
		expect(result.tool_choice).toBe("any");
		expect(result.tools).toHaveLength(2);
	});

	it("should handle 'tool' tool choice by filtering and using 'any'", () => {
		const result = prepareToolsAndToolChoice(sampleTools, {
			type: "tool",
			toolName: "calculator",
		});
		expect(result.tool_choice).toBe("any");
		expect(result.tools).toHaveLength(1);
		expect(result.tools![0].function.name).toBe("calculator");
	});
});

// ---------------------------------------------------------------------------
// processText
// ---------------------------------------------------------------------------

describe("processText", () => {
	it("should extract text from native format", () => {
		expect(processText({ response: "Hello world" })).toBe("Hello world");
	});

	it("should extract text from OpenAI format", () => {
		expect(
			processText({
				choices: [{ message: { content: "Hello from choices" } }],
			}),
		).toBe("Hello from choices");
	});

	it("should stringify object responses (structured output quirk)", () => {
		expect(processText({ response: { key: "value" } })).toBe('{"key":"value"}');
	});

	it("should handle numeric responses (quirk #9)", () => {
		expect(processText({ response: 42 })).toBe("42");
	});

	it("should return undefined for null response", () => {
		expect(processText({ response: null })).toBeUndefined();
	});

	it("should return undefined for response with no recognized fields", () => {
		expect(processText({ other: "field" })).toBeUndefined();
	});

	it("should prefer OpenAI format over native format", () => {
		expect(
			processText({
				choices: [{ message: { content: "From choices" } }],
				response: "From native",
			}),
		).toBe("From choices");
	});
});

// ---------------------------------------------------------------------------
// createRun - gateway support
// ---------------------------------------------------------------------------

describe("createRun", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	it("should use direct API URL when no gateway is provided", async () => {
		const mockResponse = {
			ok: true,
			json: vi.fn().mockResolvedValue({ result: { response: "Hello" } }),
			headers: new Headers({ "content-type": "application/json" }),
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

		const run = createRun({ accountId: "test-account", apiKey: "test-key" });
		await run("@cf/meta/llama-3.1-8b-instruct" as any, { prompt: "Hi" });

		expect(globalThis.fetch).toHaveBeenCalledWith(
			"https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/meta/llama-3.1-8b-instruct",
			expect.objectContaining({
				method: "POST",
				headers: {
					Authorization: "Bearer test-key",
					"Content-Type": "application/json",
				},
			}),
		);
	});

	it("should use gateway URL when gateway.id is provided", async () => {
		const mockResponse = {
			ok: true,
			json: vi.fn().mockResolvedValue({ result: { response: "Hello" } }),
			headers: new Headers({ "content-type": "application/json" }),
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

		const run = createRun({ accountId: "test-account", apiKey: "test-key" });
		await run("@cf/meta/llama-3.1-8b-instruct" as any, { prompt: "Hi" }, { gateway: { id: "my-gateway" } });

		expect(globalThis.fetch).toHaveBeenCalledWith(
			"https://gateway.ai.cloudflare.com/v1/test-account/my-gateway/workers-ai/run/@cf/meta/llama-3.1-8b-instruct",
			expect.objectContaining({
				method: "POST",
				headers: {
					Authorization: "Bearer test-key",
					"Content-Type": "application/json",
				},
			}),
		);
	});

	it("should add cf-aig-skip-cache header when skipCache is true", async () => {
		const mockResponse = {
			ok: true,
			json: vi.fn().mockResolvedValue({ result: { response: "Hello" } }),
			headers: new Headers({ "content-type": "application/json" }),
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

		const run = createRun({ accountId: "test-account", apiKey: "test-key" });
		await run("@cf/meta/llama-3.1-8b-instruct" as any, { prompt: "Hi" }, { gateway: { id: "my-gateway", skipCache: true } });

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({
					"cf-aig-skip-cache": "true",
				}),
			}),
		);
	});

	it("should add cf-aig-cache-ttl header when cacheTtl is provided", async () => {
		const mockResponse = {
			ok: true,
			json: vi.fn().mockResolvedValue({ result: { response: "Hello" } }),
			headers: new Headers({ "content-type": "application/json" }),
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

		const run = createRun({ accountId: "test-account", apiKey: "test-key" });
		await run("@cf/meta/llama-3.1-8b-instruct" as any, { prompt: "Hi" }, { gateway: { id: "my-gateway", cacheTtl: 3600 } });

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({
					"cf-aig-cache-ttl": "3600",
				}),
			}),
		);
	});

	it("should add cf-aig-cache-key header when cacheKey is provided", async () => {
		const mockResponse = {
			ok: true,
			json: vi.fn().mockResolvedValue({ result: { response: "Hello" } }),
			headers: new Headers({ "content-type": "application/json" }),
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

		const run = createRun({ accountId: "test-account", apiKey: "test-key" });
		await run("@cf/meta/llama-3.1-8b-instruct" as any, { prompt: "Hi" }, { gateway: { id: "my-gateway", cacheKey: "my-custom-key" } });

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({
					"cf-aig-cache-key": "my-custom-key",
				}),
			}),
		);
	});

	it("should add cf-aig-metadata header when metadata is provided", async () => {
		const mockResponse = {
			ok: true,
			json: vi.fn().mockResolvedValue({ result: { response: "Hello" } }),
			headers: new Headers({ "content-type": "application/json" }),
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

		const run = createRun({ accountId: "test-account", apiKey: "test-key" });
		await run("@cf/meta/llama-3.1-8b-instruct" as any, { prompt: "Hi" }, { gateway: { id: "my-gateway", metadata: { user: "test", session: 123 } } });

		expect(globalThis.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({
					"cf-aig-metadata": '{"user":"test","session":123}',
				}),
			}),
		);
	});

	it("should add all gateway cache headers when all options are provided", async () => {
		const mockResponse = {
			ok: true,
			json: vi.fn().mockResolvedValue({ result: { response: "Hello" } }),
			headers: new Headers({ "content-type": "application/json" }),
		};
		vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

		const run = createRun({ accountId: "test-account", apiKey: "test-key" });
		await run(
			"@cf/meta/llama-3.1-8b-instruct" as any,
			{ prompt: "Hi" },
			{
				gateway: {
					id: "my-gateway",
					skipCache: true,
					cacheTtl: 7200,
					cacheKey: "custom-key",
					metadata: { env: "prod" },
				},
			},
		);

		expect(globalThis.fetch).toHaveBeenCalledWith(
			"https://gateway.ai.cloudflare.com/v1/test-account/my-gateway/workers-ai/run/@cf/meta/llama-3.1-8b-instruct",
			expect.objectContaining({
				headers: {
					Authorization: "Bearer test-key",
					"Content-Type": "application/json",
					"cf-aig-skip-cache": "true",
					"cf-aig-cache-ttl": "7200",
					"cf-aig-cache-key": "custom-key",
					"cf-aig-metadata": '{"env":"prod"}',
				},
			}),
		);
	});
});
