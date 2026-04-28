import type { LanguageModelV3Usage } from "@ai-sdk/provider";

/**
 * Map Workers AI usage data to the AI SDK V3 usage format.
 * Accepts any object that may have a `usage` property with token counts.
 *
 * Workers AI mirrors the OpenAI usage shape, including
 * `prompt_tokens_details.cached_tokens` for prompt-cache hits. OpenAI-style
 * responses don't distinguish cache reads from cache writes, so we treat
 * `cached_tokens` as `cacheRead` and leave `cacheWrite` undefined.
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

	// Clamp at 0 in case the provider ever reports cached_tokens > prompt_tokens;
	// the v3 spec expects non-negative counts.
	const noCache =
		cachedTokens !== undefined ? Math.max(0, promptTokens - cachedTokens) : undefined;

	return {
		outputTokens: {
			total: completionTokens,
			text: undefined,
			reasoning: undefined,
		},
		inputTokens: {
			total: promptTokens,
			noCache,
			cacheRead: cachedTokens,
			cacheWrite: undefined,
		},
		raw: { total: promptTokens + completionTokens },
	};
}
