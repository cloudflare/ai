import {
	GeminiTextAdapter,
	GeminiImageAdapter,
	createGeminiSummarize as createGeminiSummarizeAdapter,
	GeminiTTSAdapter,
	GeminiTextModels,
	GeminiImageModels,
	GeminiTTSModels,
	type GeminiTextModel,
	type GeminiImageModel,
	type GeminiSummarizeModel,
} from "@tanstack/ai-gemini";

/** Derived from GeminiTTSModels since @tanstack/ai-gemini doesn't export a GeminiTTSModel type. */
export type GeminiTTSModel = (typeof GeminiTTSModels)[number];
import type { AnySummarizeAdapter, AnyTextAdapter } from "@tanstack/ai";
import type { AiGatewayCredentialsConfig, AiGatewayConfig } from "../utils/create-fetcher";

/**
 * Gemini-specific gateway config (credentials only, no binding support).
 * Includes cache control options from AiGatewayConfig.
 * See {@link https://github.com/googleapis/js-genai/issues/999 | googleapis/js-genai#999}.
 */
export type GeminiGatewayConfig = AiGatewayCredentialsConfig & AiGatewayConfig;

/**
 * Build Gemini client config that routes through AI Gateway.
 * Since GeminiClientConfig extends GoogleGenAIOptions, we can inject
 * httpOptions.baseUrl directly — no subclassing needed.
 *
 * The Google GenAI SDK doesn't support a custom `fetch` override,
 * so we set the baseUrl to the AI Gateway endpoint for Google AI Studio.
 *
 * Tracking issue: https://github.com/googleapis/js-genai/issues/999
 */
function buildGeminiGatewayConfig(config: GeminiGatewayConfig) {
	// Runtime guard: catch binding configs that bypass TypeScript (JS callers, `as any`, etc.)
	// We integrate with the Gemini SDK via `httpOptions` (baseUrl + headers), which allows
	// gateway routing and cache control but not request interception. A binding config
	// requires a custom `fetch` to route through the AI Gateway binding, and the Google
	// GenAI SDK doesn't support that yet.
	if ("binding" in config) {
		throw new Error(
			"Gemini adapters do not support binding config. " +
				"The Google GenAI SDK does not support a custom fetch function — " +
				"only credential-based config ({ accountId, gatewayId }) is supported. " +
				"See https://github.com/googleapis/js-genai/issues/999",
		);
	}

	const headers: Record<string, string> = {};

	if (config.apiKey && config.cfApiKey) {
		headers["cf-aig-authorization"] = `Bearer ${config.cfApiKey}`;
	}

	if (config.skipCache) {
		headers["cf-aig-skip-cache"] = "true";
	}
	if (typeof config.cacheTtl === "number") {
		headers["cf-aig-cache-ttl"] = String(config.cacheTtl);
	}
	if (typeof config.customCacheKey === "string") {
		headers["cf-aig-cache-key"] = config.customCacheKey;
	}
	if (typeof config.metadata === "object") {
		headers["cf-aig-metadata"] = JSON.stringify(config.metadata);
	}
	if (typeof config.byokAlias === "string" && config.byokAlias.length > 0) {
		headers["cf-aig-byok-alias"] = config.byokAlias;
	}

	const apiKey = config.apiKey ?? config.cfApiKey;

	if (!apiKey) {
		throw new Error(
			"If you want to use BYOK or unified billing, you need to pass the Cloudflare AI Gateway API key.",
		);
	}

	return {
		apiKey,
		httpOptions: {
			baseUrl: `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}/google-ai-studio`,
			headers: Object.keys(headers).length > 0 ? headers : undefined,
		},
	};
}

/** Alias for consistency with other providers (AnthropicChatModel, GrokChatModel, etc.) */
export type GeminiChatModel = GeminiTextModel;

/**
 * Creates a Gemini adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * See {@link https://github.com/googleapis/js-genai/issues/999 | googleapis/js-genai#999}.
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiChat(
	model: GeminiChatModel,
	config: GeminiGatewayConfig,
): AnyTextAdapter {
	return new GeminiTextAdapter(buildGeminiGatewayConfig(config), model);
}

/**
 * Creates a Gemini Image adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * See {@link https://github.com/googleapis/js-genai/issues/999 | googleapis/js-genai#999}.
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiImage(model: GeminiImageModel, config: GeminiGatewayConfig) {
	return new GeminiImageAdapter(buildGeminiGatewayConfig(config), model);
}

/**
 * Creates a Gemini Summarize adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * See {@link https://github.com/googleapis/js-genai/issues/999 | googleapis/js-genai#999}.
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiSummarize(
	model: GeminiSummarizeModel,
	config: GeminiGatewayConfig,
): AnySummarizeAdapter {
	const { apiKey, httpOptions } = buildGeminiGatewayConfig(config);
	return createGeminiSummarizeAdapter(apiKey, model, { httpOptions });
}

/**
 * Creates a Gemini TTS adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * See {@link https://github.com/googleapis/js-genai/issues/999 | googleapis/js-genai#999}.
 *
 * @experimental Gemini TTS is an experimental feature and may change.
 * @param model The Gemini TTS model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiTts(model: GeminiTTSModel, config: GeminiGatewayConfig) {
	return new GeminiTTSAdapter(buildGeminiGatewayConfig(config), model);
}

export {
	GeminiTextModels,
	GeminiImageModels,
	GeminiTTSModels,
	type GeminiTextModel,
	type GeminiImageModel,
	type GeminiSummarizeModel,
};
