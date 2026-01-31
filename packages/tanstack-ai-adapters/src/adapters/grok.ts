import {
	GrokTextAdapter,
	GrokImageAdapter,
	type GROK_CHAT_MODELS,
	type GROK_IMAGE_MODELS,
} from "@tanstack/ai-grok";
import OpenAi from "openai";
import { createGatewayFetch, type AiGatewayAdapterConfig } from "../utils/create-fetcher";

function createGrokClient(config: AiGatewayAdapterConfig) {
	return new OpenAi({
		fetch: createGatewayFetch("grok", config),
		apiKey: config.apiKey ?? "unused",
	});
}

type GrokAiModel = (typeof GROK_CHAT_MODELS)[number];

export class GrokTextGatewayAdapter<TModel extends GrokAiModel> extends GrokTextAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayAdapterConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - We need to override the OpenAI client for Grok
		this.client = createGrokClient(config);
	}
}

/**
 * Creates a Grok adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Grok model to use
 * @param config Configuration options
 */
export function createGrokChat(model: GrokAiModel, config: AiGatewayAdapterConfig) {
	return new GrokTextGatewayAdapter(model, config);
}

type GrokAiImageModel = (typeof GROK_IMAGE_MODELS)[number];

export class GrokImageGatewayAdapter<
	TModel extends GrokAiImageModel,
> extends GrokImageAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayAdapterConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - We need to override the OpenAI client for Grok
		this.client = createGrokClient(config);
	}
}

export function createGrokImage(model: GrokAiImageModel, config: AiGatewayAdapterConfig) {
	return new GrokImageGatewayAdapter(model, config);
}
