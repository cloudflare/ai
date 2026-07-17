/**
 * Settings for an AI Search chat model.
 *
 * Beyond `model`, any extra keys are forwarded as-is to the AI Search
 * `chatCompletions` request (e.g. `ai_search_options`), matching the Workers
 * binding — so new binding options work without a provider change. The tradeoff
 * is that unknown keys pass through rather than being rejected.
 */
export type AISearchChatSettings = {
	/** AI Search chat model id. Omit to use the instance's configured default. */
	model?: string;
	ai_search_options?: AiSearchOptions;
	[key: string]: unknown;
};
