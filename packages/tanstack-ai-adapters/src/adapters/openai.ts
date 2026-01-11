import { OpenAITextAdapter, type OPENAI_CHAT_MODELS } from "@tanstack/ai-openai";
import OpenAi from "openai";
import { createGatewayFetch, type AiGatewayConfig } from "../utils/create-fetcher";

type OpenAiModel = (typeof OPENAI_CHAT_MODELS)[number];

export class OpenAiGatewayAdapter<TModel extends OpenAiModel> extends OpenAITextAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the OpenAI client
		this.client = new OpenAi({
			fetch: createGatewayFetch("openai", config),
			apiKey: config.apiKey ?? "unused",
		});
	}
}

/**
 * Creates an OpenAI adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The OpenAI model to use
 * @param config Configuration options
 */
export function createOpenAi(model: OpenAiModel, config: AiGatewayConfig) {
	return new OpenAiGatewayAdapter(model, config);
}
