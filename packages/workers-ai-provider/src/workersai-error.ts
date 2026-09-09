import { APICallError } from "@ai-sdk/provider";
import {
	headersToObject,
	isAbortError,
	isExplicitlyRetryable,
	messageOf,
	parseWorkersAIErrorCode,
	WORKERS_AI_ERROR_CODE_TO_STATUS,
} from "@cloudflare/gateway-core";

// Re-exported from `@cloudflare/gateway-core` (single source of truth, shared
// with `@cloudflare/tanstack-ai`) so existing importers of this module keep
// working unchanged.
export { isExplicitlyRetryable, parseWorkersAIErrorCode, WORKERS_AI_ERROR_CODE_TO_STATUS };

/**
 * Normalize an error thrown by the Workers AI **binding** (`env.AI.run`) into an
 * `APICallError` so the AI SDK can classify and retry it.
 *
 * Cancellations (`AbortError` / `TimeoutError` / `ResponseAborted`, including
 * `DOMException` aborts) and errors that are already an `APICallError` pass
 * through unchanged. Everything else becomes an
 * `APICallError`; when the error carries an explicit `retryable` boolean, that
 * is forwarded to `APICallError({ isRetryable })`. When the internal code maps
 * to a known HTTP status, that `statusCode` is attached and `APICallError` derives
 * `isRetryable` from it. Unrecognized errors without an explicit `retryable`
 * property get no `statusCode`, so they stay non-retryable (the prior behavior).
 */
export function normalizeBindingError(
	error: unknown,
	context: { model: string; requestBodyValues: unknown },
): unknown {
	if (APICallError.isInstance(error) || isAbortError(error)) {
		return error;
	}

	const explicitRetryable = isExplicitlyRetryable(error);
	const code = parseWorkersAIErrorCode(error);
	const statusCode = code != null ? WORKERS_AI_ERROR_CODE_TO_STATUS[code] : undefined;
	const message = messageOf(error);

	return new APICallError({
		message,
		url: `workers-ai:binding/run/${context.model}`,
		requestBodyValues: context.requestBodyValues,
		statusCode,
		responseBody: message,
		cause: error,
		...(explicitRetryable !== undefined ? { isRetryable: explicitRetryable } : {}),
		...(code != null ? { data: { workersAIErrorCode: code } } : {}),
	});
}

/**
 * Build an `APICallError` from a non-OK Workers AI **REST** response. The HTTP
 * status is authoritative here, so `APICallError` derives `isRetryable` from it
 * directly (429 / 5xx → retryable). Response headers are preserved so the AI
 * SDK can honor `Retry-After`. The message keeps the historical
 * `"Workers AI API error (<status> <statusText>): <body>"` shape.
 */
export function apiCallErrorFromResponse(
	response: Response,
	errorBody: string,
	context: { url: string; requestBodyValues: unknown },
): APICallError {
	return new APICallError({
		message: `Workers AI API error (${response.status} ${response.statusText}): ${errorBody}`,
		url: context.url,
		requestBodyValues: context.requestBodyValues,
		statusCode: response.status,
		responseHeaders: headersToObject(response.headers),
		responseBody: errorBody,
	});
}
