import type { LanguageModelV4FinishReason } from "@ai-sdk/provider";

/**
 * Map a Workers AI finish reason to the AI SDK unified finish reason.
 *
 * Accepts either:
 * - A raw finish reason string (e.g., "stop", "tool_calls")
 * - A full response object with finish_reason in various locations
 */
export function mapWorkersAIFinishReason(
	finishReasonOrResponse: string | null | undefined | Record<string, unknown>,
): LanguageModelV4FinishReason {
	let finishReason: string | null | undefined;

	if (
		typeof finishReasonOrResponse === "string" ||
		finishReasonOrResponse === null ||
		finishReasonOrResponse === undefined
	) {
		finishReason = finishReasonOrResponse;
	} else if (typeof finishReasonOrResponse === "object" && finishReasonOrResponse !== null) {
		const response = finishReasonOrResponse;

		// OpenAI format: { choices: [{ finish_reason: "stop" }] }
		const choices = response.choices as Array<{ finish_reason?: string }> | undefined;
		if (Array.isArray(choices) && choices.length > 0) {
			finishReason = choices[0].finish_reason;
		} else if ("finish_reason" in response) {
			finishReason = response.finish_reason as string;
		} else {
			finishReason = undefined;
		}
	} else {
		// Numbers, booleans, etc. -- default to stop
		finishReason = undefined;
	}

	const raw = finishReason ?? "stop";

	switch (finishReason) {
		case "stop":
			return { unified: "stop", raw };
		case "length":
		case "model_length":
			return { unified: "length", raw };
		case "tool_calls":
			return { unified: "tool-calls", raw };
		case "error":
			return { unified: "error", raw };
		case "other":
		case "unknown":
			return { unified: "other", raw };
		default:
			return { unified: "stop", raw };
	}
}
