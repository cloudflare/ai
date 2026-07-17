import type { LanguageModelV3Usage } from "@ai-sdk/provider";

/** Map AI Search token usage into the AI SDK's nested usage shape. */
export function mapAISearchUsage(output: Record<string, unknown>): LanguageModelV3Usage {
	const usage = output.usage as
		| {
				prompt_tokens?: number;
				completion_tokens?: number;
				total_tokens?: number;
				prompt_tokens_details?: { cached_tokens?: number };
		  }
		| undefined;

	const promptTokens = usage?.prompt_tokens ?? 0;
	const completionTokens = usage?.completion_tokens ?? 0;
	const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
	const cachedTokens = usage?.prompt_tokens_details?.cached_tokens;

	return {
		outputTokens: {
			total: completionTokens,
			text: undefined,
			reasoning: undefined,
		},
		inputTokens: {
			total: promptTokens,
			noCache: cachedTokens !== undefined ? Math.max(0, promptTokens - cachedTokens) : undefined,
			cacheRead: cachedTokens,
			cacheWrite: undefined,
		},
		raw: { total: totalTokens },
	};
}
