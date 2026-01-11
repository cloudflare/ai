import { GoogleGenAI } from "@google/genai";
import { GeminiTextAdapter, type GeminiTextModels } from "@tanstack/ai-gemini";
import type { AiGatewayCredentialsConfig } from "../utils/create-fetcher";

type GeminiModel = (typeof GeminiTextModels)[number];

export class GeminiGatewayAdapter<TModel extends GeminiModel> extends GeminiTextAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayCredentialsConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the GoogleGenAI client
		this.client = new GoogleGenAI({
			apiKey: config.apiKey ?? "unused",
			httpOptions: {
				baseUrl: `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}/google-ai-studio`,
				headers: config.cfApiKey
					? {
							"cf-aig-authorization": `Bearer ${config.cfApiKey}`,
						}
					: undefined,
			},
		});
	}
}

/**
 * Creates a Gemini adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding.
 * @param model The Gemini model to use
 * @param config Configuration options
 */
export function createGemini(model: GeminiModel, config: AiGatewayCredentialsConfig) {
	return new GeminiGatewayAdapter(model, config);
}
