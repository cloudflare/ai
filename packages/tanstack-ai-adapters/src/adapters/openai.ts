import {
	OpenAIImageAdapter,
	OpenAISummarizeAdapter,
	OpenAITextAdapter,
	OpenAITranscriptionAdapter,
	OpenAIVideoAdapter,
	type OPENAI_CHAT_MODELS,
	type OPENAI_IMAGE_MODELS,
	type OPENAI_TRANSCRIPTION_MODELS,
	type OPENAI_VIDEO_MODELS,
} from "@tanstack/ai-openai";
import OpenAi from "openai";
import { createGatewayFetch, type AiGatewayAdapterConfig } from "../utils/create-fetcher";

function createOpenAiClient(config: AiGatewayAdapterConfig) {
	return new OpenAi({
		fetch: createGatewayFetch("openai", config),
		apiKey: config.apiKey ?? "unused",
	});
}

type OpenAiModel = (typeof OPENAI_CHAT_MODELS)[number];

export class OpenAiTextGatewayAdapter<
	TModel extends OpenAiModel,
> extends OpenAITextAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayAdapterConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the OpenAI client
		this.client = createOpenAiClient(config);
	}
}

/**
 * Creates an OpenAI adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The OpenAI model to use
 * @param config Configuration options
 */
export function createOpenAiChat(model: OpenAiModel, config: AiGatewayAdapterConfig) {
	return new OpenAiTextGatewayAdapter(model, config);
}

export class OpenAiSummarizeGatewayAdapter<
	TModel extends OpenAiModel,
> extends OpenAISummarizeAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayAdapterConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the text adapter
		this.textAdapter = new OpenAiTextGatewayAdapter(model, config);
	}
}

export function createOpenAiSummarize(model: OpenAiModel, config: AiGatewayAdapterConfig) {
	return new OpenAiSummarizeGatewayAdapter(model, config);
}

type OpenAiImageModel = (typeof OPENAI_IMAGE_MODELS)[number];

export class OpenAiImageGatewayAdapter<
	TModel extends OpenAiImageModel,
> extends OpenAIImageAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayAdapterConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the OpenAI client
		this.client = createOpenAiClient(config);
	}
}

export function createOpenAiImage(model: OpenAiImageModel, config: AiGatewayAdapterConfig) {
	return new OpenAiImageGatewayAdapter(model, config);
}

type OpenAiTranscriptionModel = (typeof OPENAI_TRANSCRIPTION_MODELS)[number];

export class OpenAiTranscriptionGatewayAdapter<
	TModel extends OpenAiTranscriptionModel,
> extends OpenAITranscriptionAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayAdapterConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the OpenAI client
		this.client = createOpenAiClient(config);
	}
}

export function createOpenAiTranscription(
	model: OpenAiTranscriptionModel,
	config: AiGatewayAdapterConfig,
) {
	return new OpenAiTranscriptionGatewayAdapter(model, config);
}

import { OpenAITTSAdapter, type OPENAI_TTS_MODELS } from "@tanstack/ai-openai";

type OpenAiTtsModel = (typeof OPENAI_TTS_MODELS)[number];

export class OpenAiTtsGatewayAdapter<
	TModel extends OpenAiTtsModel,
> extends OpenAITTSAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayAdapterConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the OpenAI client
		this.client = createOpenAiClient(config);
	}
}

export function createOpenAiTts(model: OpenAiTtsModel, config: AiGatewayAdapterConfig) {
	return new OpenAiTtsGatewayAdapter(model, config);
}

type OpenAiVideoModel = (typeof OPENAI_VIDEO_MODELS)[number];

export class OpenAiVideoGatewayAdapter<
	TModel extends OpenAiVideoModel,
> extends OpenAIVideoAdapter<TModel> {
	constructor(model: TModel, config: AiGatewayAdapterConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - we need to override the OpenAI client
		this.client = createOpenAiClient(config);
	}
}

export function createOpenAiVideo(model: OpenAiVideoModel, config: AiGatewayAdapterConfig) {
	return new OpenAiVideoGatewayAdapter(model, config);
}
