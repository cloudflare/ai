import type { LanguageModelV3FinishReason } from "@ai-sdk/provider";

export function mapWorkersAIFinishReason(finishReasonOrResponse: any): LanguageModelV3FinishReason {
	let finishReason: string | null | undefined;

	// If it's a string/null/undefined, use it directly (original behavior)
	if (
		typeof finishReasonOrResponse === "string" ||
		finishReasonOrResponse === null ||
		finishReasonOrResponse === undefined
	) {
		finishReason = finishReasonOrResponse;
	} else if (typeof finishReasonOrResponse === "object" && finishReasonOrResponse !== null) {
		const response = finishReasonOrResponse;

		if (
			"choices" in response &&
			Array.isArray(response.choices) &&
			response.choices.length > 0
		) {
			finishReason = response.choices[0].finish_reason;
		} else if ("finish_reason" in response) {
			finishReason = response.finish_reason;
		} else {
			finishReason = undefined;
		}
	}

	switch (finishReason) {
		case "stop":
			return { unified: "stop", raw: finishReason };
		case "length":
		case "model_length":
			return { unified: "length", raw: finishReason };
		case "tool_calls":
			return { unified: "tool-calls", raw: finishReason };
		case "content_filter":
			return { unified: "content-filter", raw: finishReason };
		case "error":
			return { unified: "error", raw: finishReason };
		case "other":
		case "unknown":
			return { unified: "other", raw: finishReason };
		default:
			// Default to `stop` for backwards compatibility
			return { unified: "stop", raw: finishReason ?? undefined };
	}
}
