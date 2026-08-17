import { describe, expect, it } from "vitest";
import { getMappedStream } from "../src/streaming";

describe("getMappedStream abort handling", () => {
	it("rejects a pending binding read with the abort reason", async () => {
		const abortController = new AbortController();
		const abortReason = new Error("timed out");
		let cancelled = false;
		const source = new ReadableStream<Uint8Array>({
			pull() {
				return new Promise(() => {});
			},
			cancel() {
				cancelled = true;
			},
		});

		const reader = getMappedStream(source, undefined, abortController.signal).getReader();
		const pendingRead = reader.read();
		abortController.abort(abortReason);

		await expect(pendingRead).rejects.toBe(abortReason);
		expect(cancelled).toBe(true);
	});
});
