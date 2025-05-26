import type { LanguageModelV2Usage } from "@ai-sdk/provider"

export function mapWorkersAIUsage(output: AiTextGenerationOutput | AiTextToImageOutput): LanguageModelV2Usage {
	const usage = (
		output as {
			usage?: { prompt_tokens: number; completion_tokens: number };
		}
	).usage ?? {
		prompt_tokens: 0,
		completion_tokens: 0,
	};

	return {
		inputTokens: usage.prompt_tokens,
		outputTokens: usage.completion_tokens,
		totalTokens: usage.prompt_tokens + usage.completion_tokens,
	};
}

