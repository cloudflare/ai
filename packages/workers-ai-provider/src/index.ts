import { AISearchChatLanguageModel } from "./aisearch-chat-language-model";
import type { AISearchChatSettings } from "./aisearch-chat-settings";
import { createRun } from "./utils";
import {
	WorkersAIEmbeddingModel,
	type WorkersAIEmbeddingSettings,
} from "./workersai-embedding-model";
import { WorkersAIChatLanguageModel } from "./workersai-chat-language-model";
import type { WorkersAIChatSettings } from "./workersai-chat-settings";
import { WorkersAIImageModel } from "./workersai-image-model";
import type { WorkersAIImageSettings } from "./workersai-image-settings";
import { WorkersAITranscriptionModel } from "./workersai-transcription-model";
import type { WorkersAITranscriptionSettings } from "./workersai-transcription-settings";
import { WorkersAISpeechModel } from "./workersai-speech-model";
import type { WorkersAISpeechSettings } from "./workersai-speech-settings";
import { WorkersAIRerankingModel } from "./workersai-reranking-model";
import type { WorkersAIRerankingSettings } from "./workersai-reranking-settings";
import type {
	EmbeddingModels,
	ImageGenerationModels,
	TextGenerationModels,
	TranscriptionModels,
	SpeechModels,
	RerankingModels,
} from "./workersai-models";

// Re-export deprecated AutoRAG aliases
export { AutoRAGChatLanguageModel } from "./autorag-chat-language-model";
export type { AutoRAGChatSettings } from "./autorag-chat-settings";

// Export new AI Search types
export { AISearchChatLanguageModel } from "./aisearch-chat-language-model";
export type { AISearchChatSettings } from "./aisearch-chat-settings";

// Export transcription and speech types
export { WorkersAITranscriptionModel } from "./workersai-transcription-model";
export type { WorkersAITranscriptionSettings } from "./workersai-transcription-settings";
export { WorkersAISpeechModel } from "./workersai-speech-model";
export type { WorkersAISpeechSettings } from "./workersai-speech-settings";
export { WorkersAIRerankingModel } from "./workersai-reranking-model";
export type { WorkersAIRerankingSettings } from "./workersai-reranking-settings";

// ---------------------------------------------------------------------------
// Workers AI
// ---------------------------------------------------------------------------

export type WorkersAISettings = (
	| {
			/**
			 * Provide a Cloudflare AI binding.
			 */
			binding: Ai;

			/**
			 * Credentials must be absent when a binding is given.
			 */
			accountId?: never;
			apiKey?: never;
	  }
	| {
			/**
			 * Provide Cloudflare API credentials directly. Must be used if a binding is not specified.
			 */
			accountId: string;
			apiKey: string;
			/**
			 * Both binding must be absent if credentials are used directly.
			 */
			binding?: never;
	  }
) & {
	/**
	 * Optionally specify a gateway.
	 */
	gateway?: GatewayOptions;
};

export interface WorkersAI {
	(modelId: TextGenerationModels, settings?: WorkersAIChatSettings): WorkersAIChatLanguageModel;
	/**
	 * Creates a model for text generation.
	 **/
	chat(
		modelId: TextGenerationModels,
		settings?: WorkersAIChatSettings,
	): WorkersAIChatLanguageModel;

	embedding(
		modelId: EmbeddingModels,
		settings?: WorkersAIEmbeddingSettings,
	): WorkersAIEmbeddingModel;

	textEmbedding(
		modelId: EmbeddingModels,
		settings?: WorkersAIEmbeddingSettings,
	): WorkersAIEmbeddingModel;

	textEmbeddingModel(
		modelId: EmbeddingModels,
		settings?: WorkersAIEmbeddingSettings,
	): WorkersAIEmbeddingModel;

	/**
	 * Creates a model for image generation.
	 **/
	image(modelId: ImageGenerationModels, settings?: WorkersAIImageSettings): WorkersAIImageModel;
	imageModel(
		modelId: ImageGenerationModels,
		settings?: WorkersAIImageSettings,
	): WorkersAIImageModel;

	/**
	 * Creates a model for speech-to-text transcription.
	 **/
	transcription(
		modelId: TranscriptionModels,
		settings?: WorkersAITranscriptionSettings,
	): WorkersAITranscriptionModel;
	transcriptionModel(
		modelId: TranscriptionModels,
		settings?: WorkersAITranscriptionSettings,
	): WorkersAITranscriptionModel;

	/**
	 * Creates a model for text-to-speech synthesis.
	 **/
	speech(modelId: SpeechModels, settings?: WorkersAISpeechSettings): WorkersAISpeechModel;
	speechModel(modelId: SpeechModels, settings?: WorkersAISpeechSettings): WorkersAISpeechModel;

	/**
	 * Creates a model for document reranking.
	 **/
	reranking(
		modelId: RerankingModels,
		settings?: WorkersAIRerankingSettings,
	): WorkersAIRerankingModel;
	rerankingModel(
		modelId: RerankingModels,
		settings?: WorkersAIRerankingSettings,
	): WorkersAIRerankingModel;
}

/**
 * Create a Workers AI provider instance.
 */
export function createWorkersAI(options: WorkersAISettings): WorkersAI {
	if (!options.binding && !("accountId" in options && "apiKey" in options)) {
		throw new Error(
			"Invalid Workers AI configuration: you must provide either a binding (e.g. { binding: env.AI }) " +
				"or credentials ({ accountId, apiKey }).",
		);
	}

	let binding: Ai;
	const isBinding = !!options.binding;

	if (options.binding) {
		binding = options.binding;
	} else {
		const { accountId, apiKey } = options;
		binding = {
			run: createRun({ accountId, apiKey }),
		} as Ai;
	}

	const createChatModel = (modelId: TextGenerationModels, settings: WorkersAIChatSettings = {}) =>
		new WorkersAIChatLanguageModel(modelId, settings, {
			binding,
			gateway: options.gateway,
			provider: "workersai.chat",
			isBinding,
		});

	const createImageModel = (
		modelId: ImageGenerationModels,
		settings: WorkersAIImageSettings = {},
	) =>
		new WorkersAIImageModel(modelId, settings, {
			binding,
			gateway: options.gateway,
			provider: "workersai.image",
		});
	const createEmbeddingModel = (
		modelId: EmbeddingModels,
		settings: WorkersAIEmbeddingSettings = {},
	) =>
		new WorkersAIEmbeddingModel(modelId, settings, {
			binding,
			gateway: options.gateway,
			provider: "workersai.embedding",
		});

	const createTranscriptionModel = (
		modelId: TranscriptionModels,
		settings: WorkersAITranscriptionSettings = {},
	) =>
		new WorkersAITranscriptionModel(modelId, settings, {
			binding,
			gateway: options.gateway,
			provider: "workersai.transcription",
			isBinding,
			credentials:
				!isBinding && "accountId" in options
					? { accountId: options.accountId, apiKey: options.apiKey }
					: undefined,
		});

	const createSpeechModel = (modelId: SpeechModels, settings: WorkersAISpeechSettings = {}) =>
		new WorkersAISpeechModel(modelId, settings, {
			binding,
			gateway: options.gateway,
			provider: "workersai.speech",
		});

	const createRerankingModel = (
		modelId: RerankingModels,
		settings: WorkersAIRerankingSettings = {},
	) =>
		new WorkersAIRerankingModel(modelId, settings, {
			binding,
			gateway: options.gateway,
			provider: "workersai.reranking",
		});

	const provider = (modelId: TextGenerationModels, settings?: WorkersAIChatSettings) => {
		if (new.target) {
			throw new Error("The WorkersAI model function cannot be called with the new keyword.");
		}
		return createChatModel(modelId, settings);
	};

	provider.chat = createChatModel;
	provider.embedding = createEmbeddingModel;
	provider.textEmbedding = createEmbeddingModel;
	provider.textEmbeddingModel = createEmbeddingModel;
	provider.image = createImageModel;
	provider.imageModel = createImageModel;
	provider.transcription = createTranscriptionModel;
	provider.transcriptionModel = createTranscriptionModel;
	provider.speech = createSpeechModel;
	provider.speechModel = createSpeechModel;
	provider.reranking = createRerankingModel;
	provider.rerankingModel = createRerankingModel;

	return provider;
}

// ---------------------------------------------------------------------------
// AI Search (formerly AutoRAG)
// ---------------------------------------------------------------------------

export type AISearchSettings = {
	binding: AutoRAG;
};

export interface AISearchProvider {
	(settings?: AISearchChatSettings): AISearchChatLanguageModel;
	/**
	 * Creates a model for text generation.
	 **/
	chat(settings?: AISearchChatSettings): AISearchChatLanguageModel;
}

/**
 * Create an AI Search provider instance.
 *
 * AI Search (formerly AutoRAG) is Cloudflare's managed search service.
 * @see https://developers.cloudflare.com/ai-search/
 */
export function createAISearch(
	options: AISearchSettings,
	/** @internal */
	providerName = "aisearch.chat",
): AISearchProvider {
	const binding = options.binding;

	const createChatModel = (settings: AISearchChatSettings = {}) =>
		new AISearchChatLanguageModel("@cf/meta/llama-3.3-70b-instruct-fp8-fast", settings, {
			binding,
			provider: providerName,
		});

	const provider = (settings?: AISearchChatSettings) => {
		if (new.target) {
			throw new Error("The AISearch model function cannot be called with the new keyword.");
		}
		return createChatModel(settings);
	};

	provider.chat = createChatModel;

	return provider;
}

// ---------------------------------------------------------------------------
// Deprecated AutoRAG aliases
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `AISearchSettings` instead. AutoRAG has been renamed to AI Search.
 * @see https://developers.cloudflare.com/ai-search/
 */
export type AutoRAGSettings = AISearchSettings;

/**
 * @deprecated Use `AISearchProvider` instead. AutoRAG has been renamed to AI Search.
 * @see https://developers.cloudflare.com/ai-search/
 */
export type AutoRAGProvider = AISearchProvider;

let autoRAGWarned = false;

/**
 * @deprecated Use `createAISearch` instead. AutoRAG has been renamed to AI Search.
 * @see https://developers.cloudflare.com/ai-search/
 */
export function createAutoRAG(options: AISearchSettings): AISearchProvider {
	if (!autoRAGWarned) {
		autoRAGWarned = true;
		console.warn(
			"[workers-ai-provider] createAutoRAG is deprecated. Use createAISearch instead. " +
				"AutoRAG has been renamed to AI Search. " +
				"See https://developers.cloudflare.com/ai-search/",
		);
	}
	return createAISearch(options, "autorag.chat");
}
