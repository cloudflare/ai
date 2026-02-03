import { GoogleGenAI } from "@google/genai";
import {
	GeminiTextAdapter,
	GeminiImageAdapter,
	GeminiSummarizeAdapter,
	type GeminiTextModels,
	type GeminiImageModels,
	type GeminiSummarizeModels,
} from "@tanstack/ai-gemini";
import type { AiGatewayCredentialsConfig } from "../utils/create-fetcher";

function createGeminiClient(config: AiGatewayCredentialsConfig) {
	return new GoogleGenAI({
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

type GeminiChatModel = (typeof GeminiTextModels)[number];

export class GeminiTextGatewayAdapter<
	TModel extends GeminiChatModel,
> extends GeminiTextAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayCredentialsConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the GoogleGenAI client
		this.client = createGeminiClient(config);
	}
}

/**
 * Creates a Gemini adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding.
 * @param model The Gemini model to use
 * @param config Configuration options
 */
export function createGeminiChat(model: GeminiChatModel, config: AiGatewayCredentialsConfig) {
	return new GeminiTextGatewayAdapter(model, config);
}

type GeminiImageModel = (typeof GeminiImageModels)[number];

export class GeminiImageGatewayAdapter<
	TModel extends GeminiImageModel,
> extends GeminiImageAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayCredentialsConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the GoogleGenAI client
		this.client = createGeminiClient(config);
	}
}

/**
 * Creates a Gemini Image adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding.
 * @param model The Gemini model to use
 * @param config Configuration options
 */
export function createGeminiImage(model: GeminiImageModel, config: AiGatewayCredentialsConfig) {
	return new GeminiImageGatewayAdapter(model, config);
}

type GeminiSummarizeModel = (typeof GeminiSummarizeModels)[number];

export class GeminiSummarizeGatewayAdapter<
	TModel extends GeminiSummarizeModel,
> extends GeminiSummarizeAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayCredentialsConfig) {
		const client = createGeminiClient(config);
		super(client, model);
	}
}

/**
 * Creates a Gemini Summarize adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding.
 * @param model The Gemini model to use
 * @param config Configuration options
 */
export function createGeminiSummarize(
	model: GeminiSummarizeModel,
	config: AiGatewayCredentialsConfig,
) {
	return new GeminiSummarizeGatewayAdapter(model, config);
}
