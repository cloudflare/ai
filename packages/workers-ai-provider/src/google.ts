import { createGoogle } from "@ai-sdk/google";
import type { ProviderPlugin } from "./gateway-delegate";

/**
 * Google (Gemini) provider plugin for the gateway delegate. Pass to
 * `createGatewayDelegate({ providers: [google] })` to handle `"google/<model>"`
 * (Google AI Studio) and `"google-vertex/<model>"` slugs.
 *
 * Requires `@ai-sdk/google` (an optional peer dependency — install it yourself).
 *
 * @deprecated Pass the vendor's own model to `createAI` from
 * `agents/models/ai-sdk` instead of a plugin plus a slug:
 * `ai(createGoogle({ apiKey: "cloudflare" })("gemini-2.5-flash"))`.
 */
export const google: ProviderPlugin = {
	wireFormat: "google",
	create: ({ modelId, fetch, baseURL }) =>
		// apiKey is a placeholder — the gateway handles auth (unified billing / BYOK)
		// and the delegate strips the x-goog-api-key header on the gateway path.
		createGoogle({ apiKey: "unused", fetch, ...(baseURL ? { baseURL } : {}) })(modelId),
};
