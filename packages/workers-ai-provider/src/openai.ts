import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderPlugin } from "./gateway-delegate";

/**
 * OpenAI-wire provider plugin for the gateway delegate. Pass to
 * `createGatewayDelegate({ providers: [openai] })` to handle every
 * OpenAI-compatible provider in one go — `openai/…`, plus the OpenAI-compatible
 * long tail (`deepseek/…`, `xai/…`, `groq/…`, `mistral/…`, `perplexity/…`,
 * `openrouter/…`, `cohere/…`, …). The registry routes each slug to its gateway
 * provider id; this plugin only supplies the response parser.
 *
 * Requires `@ai-sdk/openai` (an optional peer dependency — install it yourself).
 *
 * Uses `.chat()` (Chat Completions) deliberately: the bare `openai()` call
 * (AI SDK v6+) defaults to the Responses API, which the AI Gateway run catalog
 * does not serve.
 */
export const openai: ProviderPlugin = {
	wireFormat: "openai",
	create: ({ modelId, fetch, baseURL }) =>
		// apiKey is a placeholder — the gateway handles auth (unified billing / BYOK)
		// and the delegate strips the Authorization header on the gateway path.
		// baseURL (set by the registry for non-OpenAI openai-wire providers) makes
		// the generated URL host-strip to the right gateway-native endpoint.
		createOpenAI({ apiKey: "unused", fetch, ...(baseURL ? { baseURL } : {}) }).chat(modelId),
};
