import { GrokTextAdapter, type GROK_CHAT_MODELS } from "@tanstack/ai-grok";
import OpenAi from "openai";
import { createGatewayFetch, type AiGatewayConfig } from "../utils/create-fetcher";

type GrokAiModel = (typeof GROK_CHAT_MODELS)[number];

export class GrokGatewayAdapter<TModel extends GrokAiModel> extends GrokTextAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - We need to override the OpenAI client for Grok
		this.client = new OpenAi({
			fetch: createGatewayFetch("grok", config),
			apiKey: config.apiKey ?? "unused",
		});
	}
}

/**
 * Creates a Grok adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Grok model to use
 * @param config Configuration options
 */
export function createGrok(model: GrokAiModel, config: AiGatewayConfig) {
	return new GrokGatewayAdapter(model, config);
}
