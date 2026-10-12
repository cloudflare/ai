import { createAnthropic } from "@ai-sdk/anthropic";
import type { ProviderPlugin } from "./gateway-delegate";

/**
 * Anthropic-wire provider plugin for the gateway delegate. Pass to
 * `createGatewayDelegate({ providers: [anthropic] })` to handle
 * `"anthropic/<model>"` slugs.
 *
 * Requires `@ai-sdk/anthropic` (an optional peer dependency — install it yourself).
 *
 * @deprecated Pass the vendor's own model to `createAI` from
 * `agents/models/ai-sdk` instead of a plugin plus a slug:
 * `ai(createAnthropic({ apiKey: "cloudflare" })("claude-opus-4-8"))`.
 */
export const anthropic: ProviderPlugin = {
	wireFormat: "anthropic",
	create: ({ modelId, fetch, baseURL }) =>
		// apiKey is a placeholder — the gateway handles auth (unified billing / BYOK)
		// and the delegate strips the x-api-key header on the gateway path.
		createAnthropic({ apiKey: "unused", fetch, ...(baseURL ? { baseURL } : {}) })(modelId),
};
