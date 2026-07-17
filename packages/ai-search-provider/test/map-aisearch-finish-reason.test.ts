import { describe, expect, it } from "vitest";
import { mapAISearchFinishReason } from "../src/map-aisearch-finish-reason";

describe("mapAISearchFinishReason", () => {
	it.each([
		["stop", "stop", "stop"],
		["length", "length", "length"],
		["model_length", "length", "model_length"],
		["content_filter", "content-filter", "content_filter"],
		["tool_calls", "tool-calls", "tool_calls"],
		["error", "error", "error"],
		["other", "other", "other"],
		["unknown", "other", "unknown"],
		["something_unexpected", "other", "something_unexpected"],
	])("maps finish reason %s", (input, unified, raw) => {
		expect(mapAISearchFinishReason(input)).toEqual({ unified, raw });
	});

	it("defaults null and undefined to stop", () => {
		expect(mapAISearchFinishReason(null)).toEqual({ unified: "stop", raw: "stop" });
		expect(mapAISearchFinishReason(undefined)).toEqual({ unified: "stop", raw: "stop" });
	});

	it("reads finish_reason from a response object's first choice", () => {
		expect(mapAISearchFinishReason({ choices: [{ finish_reason: "length" }] })).toEqual({
			unified: "length",
			raw: "length",
		});
	});

	it("reads a top-level finish_reason from a response object", () => {
		expect(mapAISearchFinishReason({ finish_reason: "error" })).toEqual({
			unified: "error",
			raw: "error",
		});
	});
});
