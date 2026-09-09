/**
 * Shared, dependency-free Workers AI error classification used by every
 * consumer of `@cloudflare/gateway-core` (`workers-ai-provider` and
 * `@cloudflare/tanstack-ai`).
 *
 * The Workers AI **binding** (`env.AI.run`) throws plain `Error`s whose message
 * carries an internal code (e.g. `"3040: Capacity temporarily exceeded"`) but
 * no HTTP status. Retry machinery (the AI SDK's `APICallError` retry, the OpenAI
 * SDK's status-based retry, and our own non-chat retry loop) all key off an HTTP
 * status, so we translate the internal code into the documented status and let
 * each layer derive retryability from it — this is what makes transient failures
 * like "out of capacity" (3040 → 429) automatically retried.
 *
 * This module is intentionally free of any provider-SDK types so it can be
 * inlined into each consumer's bundle.
 */

/**
 * Workers AI internal error code → HTTP status code.
 *
 * Source: https://developers.cloudflare.com/workers-ai/platform/errors/
 */
export const WORKERS_AI_ERROR_CODE_TO_STATUS: Record<number, number> = {
	5007: 400, // No such model
	5004: 400, // Invalid data
	3039: 400, // Finetune missing required files
	3003: 400, // Incomplete request
	5018: 403, // Account not allowed for private model
	5016: 403, // Model agreement not accepted
	3023: 403, // Account blocked
	3041: 403, // Account not allowed for private model
	5019: 405, // Deprecated SDK version
	5005: 405, // LoRa unsupported
	3042: 404, // Invalid model ID
	3006: 413, // Request too large
	3007: 408, // Timeout
	3008: 408, // Aborted
	3036: 429, // Account limited (daily free allocation used up)
	3040: 429, // Out of capacity (no data center to forward to)
};

/** Read a human-readable message from any thrown value (Error, DOMException, plain object, string). */
export function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (error && typeof error === "object") {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return message;
	}
	return String(error);
}

/**
 * Best-effort extraction of a Workers AI internal error code from a thrown
 * binding error. Prefers a numeric `code` property when present, otherwise
 * parses the `"<code>: <message>"` form the binding uses (optionally prefixed,
 * e.g. `"InferenceUpstreamError: 3040: ..."`). Only recognized codes are
 * returned, and when several `"<number>:"` groups appear (e.g. a leading
 * request id) the first that maps to a known code wins, so unrelated numbers
 * can't be misread as a code.
 */
export function parseWorkersAIErrorCode(error: unknown): number | undefined {
	if (error && typeof error === "object") {
		const code = (error as { code?: unknown }).code;
		if (typeof code === "number" && code in WORKERS_AI_ERROR_CODE_TO_STATUS) {
			return code;
		}
		if (typeof code === "string") {
			const parsed = Number.parseInt(code, 10);
			if (Number.isFinite(parsed) && parsed in WORKERS_AI_ERROR_CODE_TO_STATUS) {
				return parsed;
			}
		}
	}

	const message = messageOf(error);
	for (const match of message.matchAll(/\b(\d{3,5})\s*:/g)) {
		const parsed = Number.parseInt(match[1]!, 10);
		if (parsed in WORKERS_AI_ERROR_CODE_TO_STATUS) {
			return parsed;
		}
	}

	return undefined;
}

/**
 * Map a thrown Workers AI binding error to its documented HTTP status, or
 * `undefined` when the error isn't a recognized Workers AI code (so callers can
 * decide how to treat unknown failures rather than fabricating a status).
 */
export function workersAIStatusFromError(error: unknown): number | undefined {
	const code = parseWorkersAIErrorCode(error);
	return code != null ? WORKERS_AI_ERROR_CODE_TO_STATUS[code] : undefined;
}

/**
 * True for cancellation errors that must propagate untouched (never wrapped or
 * retried, so each layer's own abort detection still fires). Mirrors the AI
 * SDK's `isAbortError`: a real abort from `fetch`/the binding is a
 * `DOMException`, which is NOT `instanceof Error`, so both must be checked.
 */
export function isAbortError(error: unknown): boolean {
	return (
		(error instanceof Error || error instanceof DOMException) &&
		(error.name === "AbortError" ||
			error.name === "ResponseAborted" ||
			error.name === "TimeoutError")
	);
}

/**
 * Whether an HTTP status should be retried. Matches the set used by the AI SDK
 * and the OpenAI SDK: request timeout (408), conflict (409), rate limit (429),
 * and any server error (>= 500).
 */
export function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 409 || status === 429 || status >= 500;
}

/**
 * Safely extract an explicit boolean `retryable` property from an error, if present.
 * Returns `true` or `false` when `error.retryable` is a boolean, otherwise `undefined`.
 */
export function isExplicitlyRetryable(error: unknown): boolean | undefined {
	if (error && typeof error === "object" && "retryable" in error) {
		const retryable = (error as { retryable?: unknown }).retryable;
		if (typeof retryable === "boolean") {
			return retryable;
		}
	}
	return undefined;
}
