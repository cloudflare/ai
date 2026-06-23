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
	KnownTextGenerationModels,
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
// AI Gateway delegate (route catalog models through AI Gateway)
//
// The delegate factory itself is internal — it's wired through
// `createWorkersAI({ providers })` (see below), so `createWorkersAI` is the
// single public entry point. The transport types, error classes, registry, and
// resume helpers are safe to re-export here (no optional `@ai-sdk/*` peer
// imports). The provider plugins (`openai`, `anthropic`, `google`) stay
// sub-path-only so those packages remain optional.
// ---------------------------------------------------------------------------

export {
	type Billing,
	createClientFallbackModel,
	type DelegateCallOptions,
	type DispatchInfo,
	type FallbackAttempt,
	type FallbackLeg,
	type FallbackOptions,
	GatewayDelegateError,
	type GatewayErrorCode,
	type GatewayErrorContext,
	GATEWAY_PROVIDERS,
	type GatewayProviderInfo,
	type ParsedSlug,
	type ProviderPlugin,
	type ResumableStreamOptions,
	type ResumeExpiredPolicy,
	type Transport,
	type WireFormat,
	WorkersAIFallbackError,
	WorkersAIGatewayError,
	createResumableStream,
	detectProviderByUrl,
	findProviderBySlug,
	parseSlug,
	selectTransport,
	wireableProviders,
} from "./gateway-delegate";
export {
	createGatewayFetch,
	createGatewayProvider,
	type GatewayFetchConfig,
} from "./gateway-provider";

import {
	createGatewayDelegate,
	type DelegateCallOptions,
	type GatewayDelegate,
	type ProviderPlugin,
	type ResumeExpiredPolicy,
} from "./gateway-delegate";

// ---------------------------------------------------------------------------
// Workers AI
// ---------------------------------------------------------------------------

/**
 * The account-wide AI Gateway used for catalog routing when no `gateway` is
 * configured. Every Cloudflare account has a `"default"` gateway.
 */
const DEFAULT_GATEWAY_ID = "default";

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

			/**
			 * Custom fetch implementation. You can use it as a middleware to
			 * intercept requests, or to provide a custom fetch implementation
			 * for e.g. testing. Only available in credentials mode.
			 */
			fetch?: typeof globalThis.fetch;
	  }
) & {
	/**
	 * Optionally specify a gateway. For third-party catalog routing (see
	 * `providers`) this defaults to the account's `"default"` gateway when unset.
	 */
	gateway?: GatewayOptions;

	/**
	 * Provider plugins that enable routing third-party catalog models
	 * (e.g. `"openai/gpt-5-mini"`) through AI Gateway. Supply them from the
	 * sub-path modules, e.g. `import { openai } from "workers-ai-provider/openai"`.
	 *
	 * When set, calling the provider with a `"<provider>/<model>"` slug (anything
	 * that is not a `@cf/...` Workers AI model id) is automatically dispatched
	 * through the {@link createGatewayDelegate | gateway delegate}. Leaving this
	 * unset preserves the exact prior behavior — only Workers AI models are built.
	 *
	 * @experimental The gateway delegate is an experimental surface.
	 */
	providers?: ProviderPlugin[];

	/**
	 * Default resume behavior for gateway-routed catalog models. Defaults to
	 * `true`. Overridable per call. Only relevant when `providers` is set.
	 */
	resume?: boolean;

	/**
	 * Default resume-expiry policy for gateway-routed catalog models (run path).
	 * Defaults to `"error"`. Only relevant when `providers` is set.
	 */
	onResumeExpired?: ResumeExpiredPolicy;
};

/**
 * True when a literal model id is a `"<provider>/<model>"` AI Gateway catalog
 * slug rather than a `@cf/...` Workers AI id. Bare `string` (a non-literal,
 * e.g. a variable) resolves to `false` so the common path keeps chat settings.
 */
type IsCatalogSlug<M extends string> = string extends M
	? false
	: M extends `@${string}`
		? false
		: M extends `${string}/${string}`
			? true
			: false;

/**
 * Picks the per-model settings type from the (captured) literal model id:
 * `DelegateCallOptions` for catalog slugs, `WorkersAIChatSettings` otherwise.
 * This is what lets `workersai("openai/gpt-5", { … })` autocomplete delegate
 * options while `workersai("@cf/…", { … })` autocompletes chat settings.
 */
type ModelSettings<M extends string> =
	IsCatalogSlug<M> extends true ? DelegateCallOptions : WorkersAIChatSettings;

export interface WorkersAI {
	<M extends string>(
		modelId: M | KnownTextGenerationModels,
		settings?: ModelSettings<M>,
	): WorkersAIChatLanguageModel;
	/**
	 * Creates a model for text generation. Accepts a `@cf/...` Workers AI id, or
	 * a `"<provider>/<model>"` catalog slug when `providers` is configured.
	 **/
	chat<M extends string>(
		modelId: M | KnownTextGenerationModels,
		settings?: ModelSettings<M>,
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
			run: createRun({ accountId, apiKey, fetch: options.fetch }),
		} as Ai;
	}

	const createChatModel = (modelId: TextGenerationModels, settings: WorkersAIChatSettings = {}) =>
		new WorkersAIChatLanguageModel(modelId, settings, {
			binding,
			gateway: options.gateway,
			provider: "workersai.chat",
			isBinding,
		});

	// Third-party catalog routing: when `providers` is configured, a non-`@cf/`
	// `"<provider>/<model>"` slug is dispatched through the gateway delegate
	// instead of being treated as a Workers AI model id. Built lazily so the
	// delegate (and its plugin requirements) only materializes on first use.
	let delegate: GatewayDelegate | undefined;
	const getDelegate = (slug: string): GatewayDelegate => {
		if (!options.providers?.length) {
			throw new Error(
				`"${slug}" looks like a third-party AI Gateway catalog model, but this Workers AI ` +
					"provider was not configured to route them. Pass provider plugins, e.g.:\n" +
					'  import { openai } from "workers-ai-provider/openai";\n' +
					"  createWorkersAI({ binding: env.AI, providers: [openai] });\n" +
					'A gateway defaults to "default" but can be set via `gateway`. ' +
					'Otherwise use a Workers AI model id (e.g. "@cf/meta/llama-3.1-8b-instruct").',
			);
		}
		delegate ??= createGatewayDelegate({
			binding,
			// Catalog routing needs a gateway (resume runs through it). When one
			// isn't configured, fall back to the account's `"default"` gateway so
			// `createWorkersAI({ providers })` works out of the box. An explicit
			// `gateway` (here or per call) always wins.
			gateway: options.gateway ?? { id: DEFAULT_GATEWAY_ID },
			providers: options.providers,
			resume: options.resume,
			onResumeExpired: options.onResumeExpired,
		});
		return delegate;
	};

	// Workers AI model ids are always `@cf/...`; gateway catalog slugs are
	// `"<provider>/<model>"`. Anything with a slash that is not `@`-prefixed is
	// treated as a catalog slug, unless it starts with `dynamic/` which is an
	// AI Gateway dynamic routing prefix and must pass through to Workers AI.
	const isGatewaySlug = (id: unknown): id is string =>
		typeof id === "string" &&
		!id.startsWith("@") &&
		!id.startsWith("dynamic/") &&
		id.includes("/");

	// Settings is the union of both shapes here; the public `WorkersAI` interface
	// narrows it per call via `ModelSettings<M>`. We branch at runtime and cast to
	// the concrete shape each path expects.
	const buildChat = (
		modelId: TextGenerationModels,
		settings?: WorkersAIChatSettings | DelegateCallOptions,
	): WorkersAIChatLanguageModel => {
		if (isGatewaySlug(modelId)) {
			// The delegate returns a `LanguageModelV3` built by the configured plugin.
			// It's structurally compatible with the AI SDK consumers this provider is
			// used with; the cast keeps the public return type unchanged.
			return getDelegate(modelId)(
				modelId,
				settings as DelegateCallOptions,
			) as unknown as WorkersAIChatLanguageModel;
		}
		return createChatModel(modelId, settings as WorkersAIChatSettings | undefined);
	};

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

	const provider = (
		modelId: TextGenerationModels,
		settings?: WorkersAIChatSettings | DelegateCallOptions,
	) => {
		if (new.target) {
			throw new Error("The WorkersAI model function cannot be called with the new keyword.");
		}
		return buildChat(modelId, settings);
	};

	provider.chat = buildChat;
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
