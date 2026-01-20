import type { LanguageModelV3Usage } from "@ai-sdk/provider";

export function mapWorkersAIUsage(output: AiTextGenerationOutput | AiTextToImageOutput): LanguageModelV3Usage {
	const usage = (
		output as {
			usage: { prompt_tokens: number; completion_tokens: number };
		}
	).usage ?? {
		completion_tokens: 0,
		prompt_tokens: 0,
	};

	return {
		inputTokens: {
			total: usage.prompt_tokens,
			noCache: undefined,
			cacheRead: undefined,
			cacheWrite: undefined,
		},
		outputTokens: {
			total: usage.completion_tokens,
			text: undefined,
			reasoning: undefined,
		},
	};
}
