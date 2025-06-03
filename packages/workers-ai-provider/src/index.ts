import {
	type ProviderV2,
} from '@ai-sdk/provider';
import { AutoRAGChatLanguageModel } from "./autorag-chat-language-model";
import type { AutoRAGChatSettings } from "./autorag-chat-settings";
import { createRun } from "./utils";
import {
	WorkersAIEmbeddingModel,
	type WorkersAIEmbeddingSettings,
} from "./workers-ai-embedding-model";
import { WorkersAIChatLanguageModel } from "./workersai-chat-language-model";
import type { WorkersAIChatSettings } from "./workersai-chat-settings";
import { WorkersAIImageModel } from "./workersai-image-model";
import type { WorkersAIImageSettings } from "./workersai-image-settings";
import type {
	EmbeddingModels,
	ImageGenerationModels,
	TextGenerationModels,
} from "./workersai-models";


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

export interface WorkersAI extends ProviderV2 {
	(modelId: TextGenerationModels, settings?: WorkersAIChatSettings): WorkersAIChatLanguageModel;
	/**
	 * Creates a model for text generation.
	 **/

	/**
	 * @deprecated Use `.languageModel()` instead.
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
	 * @deprecated use .imageModel() instead.
	 **/
	image(modelId: ImageGenerationModels, settings?: WorkersAIImageSettings): WorkersAIImageModel;

	/**
	 * Creates a model for text generation.
	 **/
	languageModel(modelId: TextGenerationModels, settings?: WorkersAIChatSettings): WorkersAIChatLanguageModel;

	/**
	 * Creates a model for image generation.
	 **/
	imageModel(modelId: string, settings?: WorkersAIImageSettings): WorkersAIImageModel;
}

/**
 * Create a Workers AI provider instance.
 */
export function createWorkersAI(options: WorkersAISettings): WorkersAI {
	// Use a binding if one is directly provided. Otherwise use credentials to create
	// a `run` method that calls the Cloudflare REST API.
	console.log("Creating Workers AI provider with options:", options);
	let binding: Ai | undefined;

	if (options.binding) {
		binding = options.binding;
	} else {
		const { accountId, apiKey } = options;
		binding = {
			run: createRun({ accountId, apiKey }),
		} as Ai;
	}

	if (!binding) {
		throw new Error("Either a binding or credentials must be provided.");
	}

	const createChatModel = (modelId: TextGenerationModels, settings: WorkersAIChatSettings = {}) =>
		new WorkersAIChatLanguageModel(modelId, settings, {
			provider: "workersai.chat",
			binding,
			gateway: options.gateway,
		});

	const createImageModel = (
		modelId: ImageGenerationModels,
		settings: WorkersAIImageSettings = {},
	) =>
		new WorkersAIImageModel(modelId, settings, {
			provider: "workersai.image",
			binding,
			gateway: options.gateway,
		});
	const createEmbeddingModel = (
		modelId: EmbeddingModels,
		settings: WorkersAIEmbeddingSettings = {},
	) =>
		new WorkersAIEmbeddingModel(modelId, settings, {
			provider: "workersai.embedding",
			binding,
			gateway: options.gateway,
		});

	const provider = (modelId: TextGenerationModels, settings?: WorkersAIChatSettings) => {
		if (new.target) {
			throw new Error("The WorkersAI model function cannot be called with the new keyword.");
		}
		return createChatModel(modelId, settings);
	};

	provider.chat = createChatModel; // Deprecated alias for `languageModel`
	provider.languageModel = createChatModel;
	provider.embedding = createEmbeddingModel;
	provider.textEmbedding = createEmbeddingModel;
	provider.textEmbeddingModel = createEmbeddingModel;
	provider.image = createImageModel;
	provider.imageModel = createImageModel;

	return provider;
}

export type AutoRAGSettings = {
	binding: AutoRAG;
};

export interface AutoRAGProvider {
	(options?: AutoRAGChatSettings): AutoRAGChatLanguageModel;
	/**
	 * Creates a model for text generation.
	 **/
	chat(settings?: AutoRAGChatSettings): AutoRAGChatLanguageModel;
}

/**
 * Create a Workers AI provider instance.
 */
export function createAutoRAG(options: AutoRAGSettings): AutoRAGProvider {
	const binding = options.binding;

	const createChatModel = (settings: AutoRAGChatSettings = {}) =>
		new AutoRAGChatLanguageModel("@cf/meta/llama-3.3-70b-instruct-fp8-fast", settings, {
			provider: "autorag.chat",
			binding,
		});

	const provider = (settings?: AutoRAGChatSettings) => {
		if (new.target) {
			throw new Error("The WorkersAI model function cannot be called with the new keyword.");
		}
		return createChatModel(settings);
	};

	provider.chat = createChatModel;

	return provider;
}
