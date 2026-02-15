/**
 * The names of the BaseAiTextGeneration models.
 *
 * Accepts any string at runtime, but provides autocomplete for known models.
 */
export type TextGenerationModels =
	| Exclude<value2key<AiModels, BaseAiTextGeneration>, value2key<AiModels, BaseAiTextToImage>>
	| (string & {});

/*
 * The names of the BaseAiTextToImage models.
 *
 * Accepts any string at runtime, but provides autocomplete for known models.
 */
export type ImageGenerationModels = value2key<AiModels, BaseAiTextToImage> | (string & {});

/**
 * The names of the BaseAiTextToEmbeddings models.
 *
 * Accepts any string at runtime, but provides autocomplete for known models.
 */
export type EmbeddingModels = value2key<AiModels, BaseAiTextEmbeddings> | (string & {});

/**
 * Workers AI models that support speech-to-text transcription.
 *
 * Includes Whisper variants from `@cloudflare/workers-types` plus
 * Deepgram partner models that may not be in the typed interface yet.
 * Accepts any string at runtime, but provides autocomplete for known models.
 */
export type TranscriptionModels =
	| value2key<AiModels, BaseAiAutomaticSpeechRecognition>
	| "@cf/deepgram/nova-3"
	| (string & {});

/**
 * Workers AI models that support text-to-speech.
 *
 * Includes models from `@cloudflare/workers-types` plus Deepgram partner
 * models that may not be in the typed interface yet.
 * Accepts any string at runtime, but provides autocomplete for known models.
 */
export type SpeechModels =
	| value2key<AiModels, BaseAiTextToSpeech>
	| "@cf/deepgram/aura-1"
	| "@cf/deepgram/aura-2-en"
	| "@cf/deepgram/aura-2-es"
	| (string & {});

/**
 * Workers AI models that support reranking.
 *
 * Accepts any string at runtime, but provides autocomplete for known models.
 */
export type RerankingModels =
	| "@cf/baai/bge-reranker-base"
	| "@cf/baai/bge-reranker-v2-m3"
	| (string & {});

type value2key<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
