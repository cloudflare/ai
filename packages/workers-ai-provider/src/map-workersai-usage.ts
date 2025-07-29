export function mapWorkersAIUsage(output: AiTextGenerationOutput | AiTextToImageOutput) {
	const usage = (
		output as {
			usage: { prompt_tokens: number; completion_tokens: number };
		}
	).usage ?? {
		completion_tokens: 0,
		prompt_tokens: 0,
	};

	return {
		outputTokens: usage.completion_tokens,
		inputTokens: usage.prompt_tokens,
		totalTokens: usage.prompt_tokens + usage.completion_tokens,
	};
}
