import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createUnified } from "./unified";

type ProviderFactory = (modelId: string) => LanguageModelV3;

export type ProviderRouterConfig = {
	/**
	 * Map of model ID prefix to a provider instance.
	 * When a model ID matches "prefix/model-name", the corresponding provider
	 * is used to create the model with the bare name (prefix stripped).
	 */
	providers: Record<string, ProviderFactory>;
	/**
	 * Optional fallback for model IDs that don't match any provider prefix.
	 * Defaults to createUnified() (OpenAI-compatible format).
	 */
	fallback?: ProviderFactory;
};

/**
 * Creates a model router that selects native provider SDKs based on
 * the model ID prefix. This preserves provider-specific features like
 * Anthropic's cache_control that are lost through the unified OpenAI-compatible path.
 */
export function createProviderRouter(config: ProviderRouterConfig): ProviderFactory {
	const fallback = config.fallback ?? createUnified();

	return (modelId: string): LanguageModelV3 => {
		const slashIndex = modelId.indexOf("/");
		if (slashIndex > 0) {
			const prefix = modelId.slice(0, slashIndex);
			const bareId = modelId.slice(slashIndex + 1);
			const provider = config.providers[prefix];
			if (provider) {
				return provider(bareId);
			}
		}

		return fallback(modelId);
	};
}
