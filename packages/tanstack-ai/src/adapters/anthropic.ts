import {
	AnthropicTextAdapter,
	AnthropicSummarizeAdapter,
	ANTHROPIC_MODELS,
	type AnthropicChatModel,
} from "@tanstack/ai-anthropic";
import { createGatewayFetch, type AiGatewayAdapterConfig } from "../utils/create-fetcher";

export type AnthropicGatewayConfig = AiGatewayAdapterConfig & { anthropicVersion?: string };

function buildAnthropicConfig(config: AnthropicGatewayConfig) {
	return {
		apiKey: config.apiKey ?? "unused",
		fetch: createGatewayFetch("anthropic", config, {
			"anthropic-version": config.anthropicVersion ?? "2023-06-01",
		}),
	};
}

/**
 * Creates an Anthropic chat adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 *
 * Since AnthropicTextConfig extends the Anthropic SDK's ClientOptions,
 * we can inject the gateway fetch directly — no subclassing needed.
 */
export function createAnthropicChat(
	model: AnthropicChatModel,
	config: AnthropicGatewayConfig,
): AnthropicTextAdapter<AnthropicChatModel> {
	return new AnthropicTextAdapter(buildAnthropicConfig(config), model);
}

/**
 * Creates an Anthropic summarize adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 */
export function createAnthropicSummarize(
	model: AnthropicChatModel,
	config: AnthropicGatewayConfig,
) {
	return new AnthropicSummarizeAdapter(buildAnthropicConfig(config), model);
}

export { ANTHROPIC_MODELS, type AnthropicChatModel };
