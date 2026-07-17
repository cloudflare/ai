import type { LanguageModelV3FinishReason } from "@ai-sdk/provider";

/**
 * Map an AI Search finish reason to the AI SDK's unified finish reason. Accepts
 * either the raw reason string or the full response object (reads
 * `choices[0].finish_reason`, falling back to a top-level `finish_reason`).
 */
export function mapAISearchFinishReason(
	finishReasonOrResponse: string | null | undefined | Record<string, unknown>,
): LanguageModelV3FinishReason {
	let finishReason: string | null | undefined;

	if (
		typeof finishReasonOrResponse === "string" ||
		finishReasonOrResponse === null ||
		finishReasonOrResponse === undefined
	) {
		finishReason = finishReasonOrResponse;
	} else {
		const choices = finishReasonOrResponse.choices as
			| Array<{ finish_reason?: string | null }>
			| undefined;
		finishReason =
			choices?.[0]?.finish_reason ?? (finishReasonOrResponse.finish_reason as string);
	}

	const raw = finishReason ?? "stop";

	switch (finishReason) {
		case "stop":
			return { unified: "stop", raw };
		case "length":
		case "model_length":
			return { unified: "length", raw };
		case "content_filter":
		case "content-filter":
			return { unified: "content-filter", raw };
		case "tool_calls":
			return { unified: "tool-calls", raw };
		case "error":
			return { unified: "error", raw };
		case "other":
		case "unknown":
			return { unified: "other", raw };
		case null:
		case undefined:
			// Absent finish reason — treat as a normal completion.
			return { unified: "stop", raw };
		default:
			// A reason we don't recognize: pass it through as `raw`, but don't
			// claim it was a clean "stop".
			return { unified: "other", raw };
	}
}
