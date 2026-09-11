import { APICallError } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import {
	apiCallErrorFromResponse,
	normalizeBindingError,
	parseWorkersAIErrorCode,
	WORKERS_AI_ERROR_CODE_TO_STATUS,
} from "../src/workersai-error";

describe("parseWorkersAIErrorCode", () => {
	it("reads a numeric `code` property", () => {
		expect(parseWorkersAIErrorCode({ code: 3040 })).toBe(3040);
		expect(parseWorkersAIErrorCode({ code: "3040" })).toBe(3040);
	});

	it("parses the `<code>: <message>` form from the message", () => {
		expect(
			parseWorkersAIErrorCode(
				new Error("3040: Capacity temporarily exceeded, please try again."),
			),
		).toBe(3040);
		expect(
			parseWorkersAIErrorCode(new Error("InferenceUpstreamError: 3040: out of capacity")),
		).toBe(3040);
		expect(parseWorkersAIErrorCode("5007: No such model @cf/foo")).toBe(5007);
	});

	it("ignores unknown / unrecognized codes", () => {
		expect(parseWorkersAIErrorCode(new Error("1101: Worker threw exception"))).toBeUndefined();
		expect(parseWorkersAIErrorCode(new Error("boom"))).toBeUndefined();
		expect(parseWorkersAIErrorCode({ code: 9999 })).toBeUndefined();
		expect(parseWorkersAIErrorCode(undefined)).toBeUndefined();
	});

	it("skips a leading unrelated number and finds the real code", () => {
		// A leading request id (not a known code) must not shadow the real code.
		expect(parseWorkersAIErrorCode(new Error("12345: ctx 3040: out of capacity"))).toBe(3040);
	});

	it("reads the message from a DOMException / plain object", () => {
		expect(parseWorkersAIErrorCode(new DOMException("3040: out of capacity", "Error"))).toBe(
			3040,
		);
		expect(parseWorkersAIErrorCode({ message: "5007: no such model" })).toBe(5007);
	});
});

describe("normalizeBindingError", () => {
	const ctx = { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", requestBodyValues: {} };

	it("maps an out-of-capacity (3040) binding error to a retryable 429 APICallError", () => {
		const err = normalizeBindingError(
			new Error("3040: Capacity temporarily exceeded, please try again."),
			ctx,
		);
		expect(APICallError.isInstance(err)).toBe(true);
		const api = err as APICallError;
		expect(api.statusCode).toBe(429);
		expect(api.isRetryable).toBe(true);
		expect(api.data).toEqual({ workersAIErrorCode: 3040 });
	});

	it("maps an inference RPM limit (3021) binding error to a retryable 429 APICallError", () => {
		const err = normalizeBindingError(
			new Error("3021: rate limiting: inference request per min rate reached"),
			ctx,
		);
		expect(APICallError.isInstance(err)).toBe(true);
		const api = err as APICallError;
		expect(api.statusCode).toBe(429);
		expect(api.isRetryable).toBe(true);
		expect(api.data).toEqual({ workersAIErrorCode: 3021 });
	});

	it("maps a client error (5007) to a non-retryable 400 APICallError", () => {
		const err = normalizeBindingError(new Error("5007: No such model"), ctx) as APICallError;
		expect(APICallError.isInstance(err)).toBe(true);
		expect(err.statusCode).toBe(400);
		expect(err.isRetryable).toBe(false);
	});

	it("wraps an unrecognized error as a non-retryable APICallError (no status)", () => {
		const err = normalizeBindingError(new Error("totally unexpected"), ctx) as APICallError;
		expect(APICallError.isInstance(err)).toBe(true);
		expect(err.statusCode).toBeUndefined();
		expect(err.isRetryable).toBe(false);
		expect(err.message).toBe("totally unexpected");
	});

	it("passes AbortError / TimeoutError through unchanged", () => {
		const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
		expect(normalizeBindingError(abort, ctx)).toBe(abort);
		const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
		expect(normalizeBindingError(timeout, ctx)).toBe(timeout);
	});

	it("passes a DOMException abort through unchanged (real fetch/binding abort shape)", () => {
		// A genuine abort is a DOMException, which is NOT `instanceof Error`.
		const abort = new DOMException("The operation was aborted", "AbortError");
		expect(normalizeBindingError(abort, ctx)).toBe(abort);
		expect(APICallError.isInstance(normalizeBindingError(abort, ctx))).toBe(false);
	});

	it("wraps a non-abort DOMException with a readable message", () => {
		const err = normalizeBindingError(
			new DOMException("something broke", "DataError"),
			ctx,
		) as APICallError;
		expect(APICallError.isInstance(err)).toBe(true);
		expect(err.message).toBe("something broke");
		expect(err.isRetryable).toBe(false);
	});

	it("passes an existing APICallError through unchanged", () => {
		const original = new APICallError({
			message: "already wrapped",
			url: "u",
			requestBodyValues: {},
			statusCode: 500,
		});
		expect(normalizeBindingError(original, ctx)).toBe(original);
	});
});

describe("apiCallErrorFromResponse", () => {
	it("derives a retryable error from a 429 response and preserves headers", () => {
		const resp = new Response("rate limited", {
			status: 429,
			statusText: "Too Many Requests",
			headers: { "retry-after": "3" },
		});
		const err = apiCallErrorFromResponse(resp, "rate limited", {
			url: "u",
			requestBodyValues: {},
		});
		expect(err.statusCode).toBe(429);
		expect(err.isRetryable).toBe(true);
		expect(err.responseHeaders?.["retry-after"]).toBe("3");
		expect(err.message).toMatch(/Workers AI API error \(429/);
	});

	it("derives a non-retryable error from a 400 response", () => {
		const resp = new Response("bad", { status: 400, statusText: "Bad Request" });
		const err = apiCallErrorFromResponse(resp, "bad", { url: "u", requestBodyValues: {} });
		expect(err.statusCode).toBe(400);
		expect(err.isRetryable).toBe(false);
	});
});

describe("WORKERS_AI_ERROR_CODE_TO_STATUS", () => {
	it("maps the documented transient codes to retryable statuses", () => {
		expect(WORKERS_AI_ERROR_CODE_TO_STATUS[3040]).toBe(429);
		expect(WORKERS_AI_ERROR_CODE_TO_STATUS[3036]).toBe(429);
		expect(WORKERS_AI_ERROR_CODE_TO_STATUS[3021]).toBe(429);
		expect(WORKERS_AI_ERROR_CODE_TO_STATUS[3007]).toBe(408);
	});
});
