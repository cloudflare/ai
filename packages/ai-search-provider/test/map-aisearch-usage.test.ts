import { describe, expect, it } from "vitest";
import { mapAISearchUsage } from "../src/map-aisearch-usage";

describe("mapAISearchUsage", () => {
	it("maps token usage into the nested shape, including cache reads", () => {
		expect(
			mapAISearchUsage({
				usage: {
					prompt_tokens: 10,
					completion_tokens: 4,
					total_tokens: 14,
					prompt_tokens_details: { cached_tokens: 6 },
				},
			}),
		).toEqual({
			inputTokens: { total: 10, noCache: 4, cacheRead: 6, cacheWrite: undefined },
			outputTokens: { total: 4, text: undefined, reasoning: undefined },
			raw: { total: 14 },
		});
	});

	it("defaults to zeroed usage when absent", () => {
		expect(mapAISearchUsage({})).toEqual({
			inputTokens: {
				total: 0,
				noCache: undefined,
				cacheRead: undefined,
				cacheWrite: undefined,
			},
			outputTokens: { total: 0, text: undefined, reasoning: undefined },
			raw: { total: 0 },
		});
	});
});
