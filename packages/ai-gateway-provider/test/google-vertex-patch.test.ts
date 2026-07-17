import { describe, expect, it } from "vitest";
import { CF_TEMP_TOKEN } from "../src/auth";
import { createVertex } from "../src/providers/google-vertex";

/**
 * Regression test for the `@ai-sdk/google-vertex` pnpm patch (see
 * `patches/@ai-sdk__google-vertex.patch`).
 *
 * The patch short-circuits `generateAuthToken` to return `cfApiKey` instead of
 * exchanging Google service-account credentials for an OAuth token. The patch
 * is keyed by a semver range in `pnpm-workspace.yaml`, and pnpm applies range
 * patches best-effort: if a future version reshuffles `dist/`, the patch can
 * silently stop applying with no install error. Without it, this call throws
 * while building a JWT from the credential-less config — so asserting the
 * Authorization header here is what turns that silent failure into a red CI.
 */
describe("google-vertex pnpm patch", () => {
	it("sends CF_TEMP_TOKEN as the bearer token (patch is applied)", async () => {
		const sentinel = new Error("stop-after-headers");
		let authorization: string | null | undefined;

		const capturingFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
			authorization = new Headers(init?.headers).get("authorization");
			throw sentinel;
		}) as typeof globalThis.fetch;

		const vertex = createVertex({
			project: "test-project",
			location: "us-central1",
			fetch: capturingFetch,
		});
		const model = vertex("gemini-2.0-flash");

		await expect(
			model.doGenerate({
				prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
			}),
		).rejects.toThrow();

		expect(authorization).toBe(`Bearer ${CF_TEMP_TOKEN}`);
	});
});
