import { AnthropicTextAdapter, AnthropicSummarizeAdapter } from "@tanstack/ai-anthropic";
import AnthropicSdk from "@anthropic-ai/sdk";
import { createGatewayFetch, type AiGatewayAdapterConfig } from "../utils/create-fetcher";

export type AnthropicGatewayConfig = AiGatewayAdapterConfig & { anthropicVersion?: string };

function createAnthropicClient(config: AnthropicGatewayConfig) {
	return new AnthropicSdk({
		apiKey: config.apiKey ?? "unused",
		fetch: createGatewayFetch("anthropic", config, {
			"anthropic-version": config.anthropicVersion ?? "2023-06-01",
		}),
	});
}

const ANTHROPIC_MODELS = [
	"claude-opus-4-5",
	"claude-sonnet-4-5",
	"claude-haiku-4-5",
	"claude-opus-4-1",
	"claude-sonnet-4",
	"claude-3-7-sonnet",
	"claude-opus-4",
	"claude-3-5-haiku",
	"claude-3-haiku",
] as const;

type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];

export class AnthropicTextGatewayAdapter<
	TModel extends AnthropicModel,
> extends AnthropicTextAdapter<TModel> {
	constructor(config: AnthropicGatewayConfig, model: TModel) {
		super(config, model);

		// @ts-expect-error - We need to override the Anthropic client
		this.client = createAnthropicClient(config);
	}
}

/**
 * Creates an Anthropic adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Anthropic model to use
 * @param config Configuration options
 */
export function createAnthropicChat(model: AnthropicModel, config: AnthropicGatewayConfig) {
	return new AnthropicTextGatewayAdapter(config, model);
}

export class AnthropicSummarizeGatewayAdapter<
	TModel extends AnthropicModel,
> extends AnthropicSummarizeAdapter<TModel> {
	constructor(config: AnthropicGatewayConfig, model: TModel) {
		super(config, model);

		// @ts-expect-error - We need to override the Anthropic client
		this.client = createAnthropicClient(config);
	}
}

/**
 * Creates an Anthropic summarize adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Anthropic model to use
 * @param config Configuration options
 */
export function createAnthropicSummarize(model: AnthropicModel, config: AnthropicGatewayConfig) {
	return new AnthropicSummarizeGatewayAdapter(config, model);
}
