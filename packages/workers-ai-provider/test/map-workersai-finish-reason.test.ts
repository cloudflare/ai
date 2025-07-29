import { describe, expect, it } from "vitest";
import { mapWorkersAIFinishReason } from "../src/map-workersai-finish-reason";
import type { LanguageModelV2FinishReason } from "@ai-sdk/provider";

describe("mapWorkersAIFinishReason", () => {
	describe("direct mappings", () => {
		it('should map "stop" to "stop"', () => {
			const result = mapWorkersAIFinishReason("stop");
			expect(result).toBe("stop");
		});

		it('should map "length" to "length"', () => {
			const result = mapWorkersAIFinishReason("length");
			expect(result).toBe("length");
		});

		it('should map "model_length" to "length"', () => {
			const result = mapWorkersAIFinishReason("model_length");
			expect(result).toBe("length");
		});

		it('should map "tool_calls" to "tool-calls"', () => {
			const result = mapWorkersAIFinishReason("tool_calls");
			expect(result).toBe("tool-calls");
		});

		it('should map "error" to "error"', () => {
			const result = mapWorkersAIFinishReason("error");
			expect(result).toBe("error");
		});

		it('should map "other" to "other"', () => {
			const result = mapWorkersAIFinishReason("other");
			expect(result).toBe("other");
		});

		it('should map "unknown" to "unknown"', () => {
			const result = mapWorkersAIFinishReason("unknown");
			expect(result).toBe("unknown");
		});
	});

	describe("default case handling", () => {
		it('should default to "stop" for null input', () => {
			const result = mapWorkersAIFinishReason(null);
			expect(result).toBe("stop");
		});

		it('should default to "stop" for undefined input', () => {
			const result = mapWorkersAIFinishReason(undefined);
			expect(result).toBe("stop");
		});

		it('should default to "stop" for unrecognized string values', () => {
			const result = mapWorkersAIFinishReason("unrecognized_value");
			expect(result).toBe("stop");
		});

		it('should default to "stop" for empty string', () => {
			const result = mapWorkersAIFinishReason("");
			expect(result).toBe("stop");
		});
	});

	describe("return type validation", () => {
		it("should return a valid LanguageModelV1FinishReason type", () => {
			const validReasons: LanguageModelV2FinishReason[] = [
				"stop",
				"length",
				"tool-calls",
				"error",
				"other",
				"unknown",
			];

			// Test that all our mapped values are valid
			expect(validReasons).toContain(mapWorkersAIFinishReason("stop"));
			expect(validReasons).toContain(mapWorkersAIFinishReason("length"));
			expect(validReasons).toContain(mapWorkersAIFinishReason("model_length"));
			expect(validReasons).toContain(mapWorkersAIFinishReason("tool_calls"));
			expect(validReasons).toContain(mapWorkersAIFinishReason("error"));
			expect(validReasons).toContain(mapWorkersAIFinishReason("other"));
			expect(validReasons).toContain(mapWorkersAIFinishReason("unknown"));
			expect(validReasons).toContain(mapWorkersAIFinishReason(null));
		});
	});

	describe("comprehensive mapping test", () => {
		it("should handle all expected inputs correctly", () => {
			const testCases: Array<[string | null | undefined, LanguageModelV2FinishReason]> = [
				["stop", "stop"],
				["length", "length"],
				["model_length", "length"],
				["tool_calls", "tool-calls"],
				["error", "error"],
				["other", "other"],
				["unknown", "unknown"],
				[null, "stop"],
				[undefined, "stop"],
				["invalid", "stop"],
				["", "stop"],
			];

			for (const [input, expected] of testCases) {
				expect(mapWorkersAIFinishReason(input)).toBe(expected);
			}
		});
	});

	describe("response with choices array", () => {
		it("should extract finish_reason from choices[0]", () => {
			const response = {
				choices: [{ finish_reason: "stop" }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});

		it("should handle all finish reasons from choices[0]", () => {
			const testCases = [
				{ expected: "stop", input: "stop" },
				{ expected: "length", input: "length" },
				{ expected: "length", input: "model_length" },
				{ expected: "tool-calls", input: "tool_calls" },
				{ expected: "error", input: "error" },
				{ expected: "other", input: "other" },
				{ expected: "unknown", input: "unknown" },
				{ expected: "stop", input: "invalid_reason" },
			];

			for (const { input, expected } of testCases) {
				const response = {
					choices: [{ finish_reason: input }],
				};
				expect(mapWorkersAIFinishReason(response)).toBe(expected);
			}
		});

		it('should default to "stop" when choices[0].finish_reason is null', () => {
			const response = {
				choices: [{ finish_reason: null }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});

		it('should default to "stop" when choices[0].finish_reason is undefined', () => {
			const response = {
				choices: [{ finish_reason: undefined }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});

		it('should default to "stop" when choices[0] has no finish_reason property', () => {
			const response = {
				choices: [{ some_other_property: "value" }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});

		it('should default to "stop" when choices array is empty', () => {
			const response = {
				choices: [],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});

		it("should only use first choice when multiple choices exist", () => {
			const response = {
				choices: [{ finish_reason: "stop" }, { finish_reason: "length" }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});
	});

	describe("response with direct finish_reason property", () => {
		it("should extract finish_reason from response object", () => {
			const response = {
				finish_reason: "length",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("length");
		});

		it("should handle all finish reasons from direct property", () => {
			const testCases = [
				{ expected: "stop", input: "stop" },
				{ expected: "length", input: "length" },
				{ expected: "length", input: "model_length" },
				{ expected: "tool-calls", input: "tool_calls" },
				{ expected: "error", input: "error" },
				{ expected: "other", input: "other" },
				{ expected: "unknown", input: "unknown" },
				{ expected: "stop", input: "invalid_reason" },
			];

			for (const { input, expected } of testCases) {
				const response = { finish_reason: input };
				expect(mapWorkersAIFinishReason(response)).toBe(expected);
			}
		});

		it('should default to "stop" when finish_reason is null', () => {
			const response = {
				finish_reason: null,
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});

		it('should default to "stop" when finish_reason is undefined', () => {
			const response = {
				finish_reason: undefined,
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});
	});

	describe("precedence and edge cases", () => {
		it("should prioritize choices[0].finish_reason over direct finish_reason", () => {
			const response = {
				choices: [{ finish_reason: "length" }],
				finish_reason: "stop",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("length");
		});

		it("should fall back to direct finish_reason when choices is not an array", () => {
			const response = {
				choices: "not_an_array",
				finish_reason: "error",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("error");
		});

		it("should fall back to direct finish_reason when choices is null", () => {
			const response = {
				choices: null,
				finish_reason: "other",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("other");
		});

		it('should default to "stop" when object has neither choices nor finish_reason', () => {
			const response = {
				some_other_property: "value",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});

		it("should handle empty object", () => {
			const response = {};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});

		it("should handle complex nested objects without expected properties", () => {
			const response = {
				array: [1, 2, 3],
				nested: {
					deep: {
						property: "value",
					},
				},
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toBe("stop");
		});
	});

	describe("type flexibility", () => {
		it("should handle array input", () => {
			const result = mapWorkersAIFinishReason([]);
			expect(result).toBe("stop");
		});

		it("should handle number input", () => {
			const result = mapWorkersAIFinishReason(42);
			expect(result).toBe("stop");
		});

		it("should handle boolean input", () => {
			const result = mapWorkersAIFinishReason(true);
			expect(result).toBe("stop");
		});
	});
});
