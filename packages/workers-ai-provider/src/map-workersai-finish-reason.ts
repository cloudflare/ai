import type { LanguageModelV2FinishReason } from "@ai-sdk/provider";

export function mapWorkersAIFinishReason(finishReasonOrResponse: any): LanguageModelV2FinishReason {
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
			return "stop";
		case "length":
		case "model_length":
			return "length";
		case "tool_calls":
			return "tool-calls";
		case "error":
			return "error";
		case "other":
			return "other";
		case "unknown":
			return "unknown";
		default:
			// Default to `stop` for backwards compatibility
			return "stop";
	}
}
