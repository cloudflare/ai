import { AnthropicTextAdapter } from "@tanstack/ai-anthropic";
import AnthropicSdk from "@anthropic-ai/sdk";
import { createGatewayFetch, type AiGatewayConfig } from "../utils/create-fetcher";

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

export class AnthropicGatewayAdapter<
	TModel extends AnthropicModel,
> extends AnthropicTextAdapter<TModel> {
	constructor(config: AiGatewayConfig, model: TModel) {
		super(config, model);

		// @ts-expect-error - We need to override the Anthropic client
		this.client = new AnthropicSdk({
			apiKey: config.apiKey ?? "unused",
			fetch: createGatewayFetch("anthropic", config, {
				"anthropic-version": "2023-06-01",
			}),
		});
	}
}

/**
 * Creates an Anthropic adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Anthropic model to use
 * @param config Configuration options
 */
export function createAnthropic(model: AnthropicModel, config: AiGatewayConfig) {
	return new AnthropicGatewayAdapter(config, model);
}
