import { describe, expect, it } from "vitest";
import { mapWorkersAIUsage } from "../src/map-workersai-usage";

describe("mapWorkersAIUsage", () => {
	it("should map standard usage with prompt and completion tokens", () => {
		const result = mapWorkersAIUsage({
			usage: { prompt_tokens: 10, completion_tokens: 20 },
		});

		expect(result.inputTokens.total).toBe(10);
		expect(result.outputTokens.total).toBe(20);
		expect(result.raw).toEqual({ total: 30 });
	});

	it("should default to zero tokens when usage is missing", () => {
		const result = mapWorkersAIUsage({});

		expect(result.inputTokens.total).toBe(0);
		expect(result.outputTokens.total).toBe(0);
		expect(result.raw).toEqual({ total: 0 });
	});

	it("should handle partial usage (only prompt_tokens)", () => {
		const result = mapWorkersAIUsage({
			usage: { prompt_tokens: 15 },
		});

		expect(result.inputTokens.total).toBe(15);
		expect(result.outputTokens.total).toBe(0);
		expect(result.raw).toEqual({ total: 15 });
	});

	it("should handle partial usage (only completion_tokens)", () => {
		const result = mapWorkersAIUsage({
			usage: { completion_tokens: 25 },
		});

		expect(result.inputTokens.total).toBe(0);
		expect(result.outputTokens.total).toBe(25);
		expect(result.raw).toEqual({ total: 25 });
	});

	it("should handle zero tokens explicitly", () => {
		const result = mapWorkersAIUsage({
			usage: { prompt_tokens: 0, completion_tokens: 0 },
		});

		expect(result.inputTokens.total).toBe(0);
		expect(result.outputTokens.total).toBe(0);
		expect(result.raw).toEqual({ total: 0 });
	});

	it("should set undefined for cache and reasoning fields", () => {
		const result = mapWorkersAIUsage({
			usage: { prompt_tokens: 5, completion_tokens: 10 },
		});

		expect(result.inputTokens.noCache).toBeUndefined();
		expect(result.inputTokens.cacheRead).toBeUndefined();
		expect(result.inputTokens.cacheWrite).toBeUndefined();
		expect(result.outputTokens.text).toBeUndefined();
		expect(result.outputTokens.reasoning).toBeUndefined();
	});

	it("should handle usage with extra fields gracefully", () => {
		const result = mapWorkersAIUsage({
			usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
		} as any);

		expect(result.inputTokens.total).toBe(5);
		expect(result.outputTokens.total).toBe(10);
	});

	it("should map cacheRead and noCache when prompt_tokens_details is present", () => {
		const result = mapWorkersAIUsage({
			usage: {
				prompt_tokens: 6377,
				completion_tokens: 349,
				prompt_tokens_details: { cached_tokens: 2861 },
			},
		} as any);

		expect(result.inputTokens.cacheRead).toBe(2861);
		expect(result.inputTokens.noCache).toBe(6377 - 2861);
		expect(result.inputTokens.cacheWrite).toBeUndefined();
	});

	it("should handle cached_tokens of 0 (all tokens uncached)", () => {
		const result = mapWorkersAIUsage({
			usage: {
				prompt_tokens: 100,
				completion_tokens: 50,
				prompt_tokens_details: { cached_tokens: 0 },
			},
		} as any);

		expect(result.inputTokens.cacheRead).toBe(0);
		expect(result.inputTokens.noCache).toBe(100 - 0);
	});

	it("should handle prompt_tokens_details with missing cached_tokens", () => {
		const result = mapWorkersAIUsage({
			usage: {
				prompt_tokens: 100,
				completion_tokens: 50,
				prompt_tokens_details: {},
			},
		} as any);

		expect(result.inputTokens.cacheRead).toBeUndefined();
		expect(result.inputTokens.noCache).toBeUndefined();
	});

	it("should compute raw total correctly regardless of cache fields", () => {
		const result = mapWorkersAIUsage({
			usage: {
				prompt_tokens: 1000,
				completion_tokens: 200,
				prompt_tokens_details: { cached_tokens: 800 },
			},
		} as any);

		expect(result.raw).toEqual({ total: 1000 + 200 });
	});
});
