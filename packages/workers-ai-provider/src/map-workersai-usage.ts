import type { LanguageModelV3Usage } from "@ai-sdk/provider";

/**
 * Map Workers AI usage data to the AI SDK V3 usage format.
 * Accepts any object that may have a `usage` property with token counts.
 */
export function mapWorkersAIUsage(
	output: Record<string, unknown> | AiTextGenerationOutput | AiTextToImageOutput,
): LanguageModelV3Usage {
	const usage = (
		output as {
			usage?: {
				prompt_tokens?: number;
				completion_tokens?: number;
				prompt_tokens_details?: { cached_tokens?: number };
			};
		}
	).usage ?? {
		completion_tokens: 0,
		prompt_tokens: 0,
	};

	const promptTokens = usage.prompt_tokens ?? 0;
	const completionTokens = usage.completion_tokens ?? 0;
	const cachedTokens = usage.prompt_tokens_details?.cached_tokens;

	return {
		outputTokens: {
			total: completionTokens,
			text: undefined,
			reasoning: undefined,
		},
		inputTokens: {
			total: promptTokens,
			noCache: cachedTokens !== undefined ? promptTokens - cachedTokens : undefined,
			cacheRead: cachedTokens,
			cacheWrite: undefined,
		},
		raw: { total: promptTokens + completionTokens },
	};
}
