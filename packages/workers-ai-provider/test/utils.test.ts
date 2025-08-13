import { describe, expect, it } from "vitest";
import { processPartialToolCalls, processToolCalls } from "../src/utils";

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
				},
			],
		};

		const result = processToolCalls(output);
		expect(result).toEqual([
			{
				input: '{"param": "value"}',
				toolCallId: "test_function",
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
});

describe("prepareToolsAndToolChoice", () => {
	it.todo("should send the right format");
});
