import type { LanguageModelV3FinishReason } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { mapWorkersAIFinishReason } from "../src/map-workersai-finish-reason";

describe("mapWorkersAIFinishReason", () => {
	describe("direct mappings", () => {
		it('should map "stop" to unified "stop"', () => {
			const result = mapWorkersAIFinishReason("stop");
			expect(result).toEqual({ unified: "stop", raw: "stop" });
		});

		it('should map "length" to unified "length"', () => {
			const result = mapWorkersAIFinishReason("length");
			expect(result).toEqual({ unified: "length", raw: "length" });
		});

		it('should map "model_length" to unified "length"', () => {
			const result = mapWorkersAIFinishReason("model_length");
			expect(result).toEqual({ unified: "length", raw: "model_length" });
		});

		it('should map "tool_calls" to unified "tool-calls"', () => {
			const result = mapWorkersAIFinishReason("tool_calls");
			expect(result).toEqual({ unified: "tool-calls", raw: "tool_calls" });
		});

		it('should map "error" to unified "error"', () => {
			const result = mapWorkersAIFinishReason("error");
			expect(result).toEqual({ unified: "error", raw: "error" });
		});

		it('should map "other" to unified "other"', () => {
			const result = mapWorkersAIFinishReason("other");
			expect(result).toEqual({ unified: "other", raw: "other" });
		});

		it('should map "unknown" to unified "other"', () => {
			const result = mapWorkersAIFinishReason("unknown");
			expect(result).toEqual({ unified: "other", raw: "unknown" });
		});
	});

	describe("default case handling", () => {
		it('should default to unified "stop" for null input', () => {
			const result = mapWorkersAIFinishReason(null);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it('should default to unified "stop" for undefined input', () => {
			const result = mapWorkersAIFinishReason(undefined);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it('should default to unified "stop" for unrecognized string values', () => {
			const result = mapWorkersAIFinishReason("unrecognized_value");
			expect(result).toEqual({ unified: "stop", raw: "unrecognized_value" });
		});

		it('should default to unified "stop" for empty string', () => {
			const result = mapWorkersAIFinishReason("");
			expect(result).toEqual({ unified: "stop", raw: "" });
		});
	});

	describe("return type validation", () => {
		it("should return a valid LanguageModelV3FinishReason type", () => {
			const validUnifiedReasons = ["stop", "length", "tool-calls", "error", "other", "unknown"];

			// Test that all our mapped values have valid unified reasons
			expect(validUnifiedReasons).toContain(mapWorkersAIFinishReason("stop").unified);
			expect(validUnifiedReasons).toContain(mapWorkersAIFinishReason("length").unified);
			expect(validUnifiedReasons).toContain(mapWorkersAIFinishReason("model_length").unified);
			expect(validUnifiedReasons).toContain(mapWorkersAIFinishReason("tool_calls").unified);
			expect(validUnifiedReasons).toContain(mapWorkersAIFinishReason("error").unified);
			expect(validUnifiedReasons).toContain(mapWorkersAIFinishReason("other").unified);
			// "unknown" maps to "other" in the implementation
			expect(mapWorkersAIFinishReason("unknown").unified).toBe("other");
			expect(validUnifiedReasons).toContain(mapWorkersAIFinishReason(null).unified);
		});
	});

	describe("comprehensive mapping test", () => {
		it("should handle all expected inputs correctly", () => {
			const testCases: Array<[string | null | undefined, LanguageModelV3FinishReason]> = [
				["stop", { unified: "stop", raw: "stop" }],
				["length", { unified: "length", raw: "length" }],
				["model_length", { unified: "length", raw: "model_length" }],
				["tool_calls", { unified: "tool-calls", raw: "tool_calls" }],
				["error", { unified: "error", raw: "error" }],
				["other", { unified: "other", raw: "other" }],
				["unknown", { unified: "other", raw: "unknown" }],
				[null, { unified: "stop", raw: undefined }],
				[undefined, { unified: "stop", raw: undefined }],
				["invalid", { unified: "stop", raw: "invalid" }],
				["", { unified: "stop", raw: "" }],
			];

			for (const [input, expected] of testCases) {
				expect(mapWorkersAIFinishReason(input)).toEqual(expected);
			}
		});
	});

	describe("response with choices array", () => {
		it("should extract finish_reason from choices[0]", () => {
			const response = {
				choices: [{ finish_reason: "stop" }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: "stop" });
		});

		it("should handle all finish reasons from choices[0]", () => {
			const testCases = [
				{ expected: { unified: "stop", raw: "stop" }, input: "stop" },
				{ expected: { unified: "length", raw: "length" }, input: "length" },
				{ expected: { unified: "length", raw: "model_length" }, input: "model_length" },
				{ expected: { unified: "tool-calls", raw: "tool_calls" }, input: "tool_calls" },
				{ expected: { unified: "error", raw: "error" }, input: "error" },
				{ expected: { unified: "other", raw: "other" }, input: "other" },
				{ expected: { unified: "other", raw: "unknown" }, input: "unknown" },
				{ expected: { unified: "stop", raw: "invalid_reason" }, input: "invalid_reason" },
			];

			for (const { input, expected } of testCases) {
				const response = {
					choices: [{ finish_reason: input }],
				};
				expect(mapWorkersAIFinishReason(response)).toEqual(expected);
			}
		});

		it('should default to unified "stop" when choices[0].finish_reason is null', () => {
			const response = {
				choices: [{ finish_reason: null }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it('should default to unified "stop" when choices[0].finish_reason is undefined', () => {
			const response = {
				choices: [{ finish_reason: undefined }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it('should default to unified "stop" when choices[0] has no finish_reason property', () => {
			const response = {
				choices: [{ some_other_property: "value" }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it('should default to unified "stop" when choices array is empty', () => {
			const response = {
				choices: [],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it("should only use first choice when multiple choices exist", () => {
			const response = {
				choices: [{ finish_reason: "stop" }, { finish_reason: "length" }],
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: "stop" });
		});
	});

	describe("response with direct finish_reason property", () => {
		it("should extract finish_reason from response object", () => {
			const response = {
				finish_reason: "length",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "length", raw: "length" });
		});

		it("should handle all finish reasons from direct property", () => {
			const testCases = [
				{ expected: { unified: "stop", raw: "stop" }, input: "stop" },
				{ expected: { unified: "length", raw: "length" }, input: "length" },
				{ expected: { unified: "length", raw: "model_length" }, input: "model_length" },
				{ expected: { unified: "tool-calls", raw: "tool_calls" }, input: "tool_calls" },
				{ expected: { unified: "error", raw: "error" }, input: "error" },
				{ expected: { unified: "other", raw: "other" }, input: "other" },
				{ expected: { unified: "other", raw: "unknown" }, input: "unknown" },
				{ expected: { unified: "stop", raw: "invalid_reason" }, input: "invalid_reason" },
			];

			for (const { input, expected } of testCases) {
				const response = { finish_reason: input };
				expect(mapWorkersAIFinishReason(response)).toEqual(expected);
			}
		});

		it('should default to unified "stop" when finish_reason is null', () => {
			const response = {
				finish_reason: null,
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it('should default to unified "stop" when finish_reason is undefined', () => {
			const response = {
				finish_reason: undefined,
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});
	});

	describe("precedence and edge cases", () => {
		it("should prioritize choices[0].finish_reason over direct finish_reason", () => {
			const response = {
				choices: [{ finish_reason: "length" }],
				finish_reason: "stop",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "length", raw: "length" });
		});

		it("should fall back to direct finish_reason when choices is not an array", () => {
			const response = {
				choices: "not_an_array",
				finish_reason: "error",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "error", raw: "error" });
		});

		it("should fall back to direct finish_reason when choices is null", () => {
			const response = {
				choices: null,
				finish_reason: "other",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "other", raw: "other" });
		});

		it('should default to unified "stop" when object has neither choices nor finish_reason', () => {
			const response = {
				some_other_property: "value",
			};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it("should handle empty object", () => {
			const response = {};
			const result = mapWorkersAIFinishReason(response);
			expect(result).toEqual({ unified: "stop", raw: undefined });
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
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});
	});

	describe("type flexibility", () => {
		it("should handle array input", () => {
			const result = mapWorkersAIFinishReason([]);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it("should handle number input", () => {
			const result = mapWorkersAIFinishReason(42);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});

		it("should handle boolean input", () => {
			const result = mapWorkersAIFinishReason(true);
			expect(result).toEqual({ unified: "stop", raw: undefined });
		});
	});
});
