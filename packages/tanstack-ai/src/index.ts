// Adapter factory functions
export { createAnthropicChat, createAnthropicSummarize } from "./adapters/anthropic";
export type { AnthropicGatewayConfig } from "./adapters/anthropic";
export { ANTHROPIC_MODELS, type AnthropicChatModel } from "./adapters/anthropic";

export {
	createGeminiChat,
	createGeminiImage,
	createGeminiSummarize,
	createGeminiTts,
} from "./adapters/gemini";
export type { GeminiGatewayConfig } from "./adapters/gemini";
export {
	GeminiTextModels,
	GeminiImageModels,
	GeminiSummarizeModels,
	GeminiTTSModels,
	type GeminiChatModel,
	type GeminiTextModel,
	type GeminiImageModel,
	type GeminiSummarizeModel,
	type GeminiTTSModel,
} from "./adapters/gemini";

export { createGrokChat, createGrokImage, createGrokSummarize } from "./adapters/grok";
export type { GrokGatewayConfig } from "./adapters/grok";
export {
	GROK_CHAT_MODELS,
	GROK_IMAGE_MODELS,
	type GrokChatModel,
	type GrokImageModel,
	type GrokSummarizeModel,
} from "./adapters/grok";

export {
	createOpenAiChat,
	createOpenAiImage,
	createOpenAiSummarize,
	createOpenAiTranscription,
	createOpenAiTts,
	createOpenAiVideo,
} from "./adapters/openai";
export type { OpenAiGatewayConfig } from "./adapters/openai";
export {
	OPENAI_CHAT_MODELS,
	OPENAI_IMAGE_MODELS,
	OPENAI_TRANSCRIPTION_MODELS,
	OPENAI_TTS_MODELS,
	OPENAI_VIDEO_MODELS,
	type OpenAIChatModel,
	type OpenAIImageModel,
	type OpenAITranscriptionModel,
	type OpenAITTSModel,
	type OpenAIVideoModel,
} from "./adapters/openai";

export {
	createOpenRouterChat,
	createOpenRouterImage,
	createOpenRouterSummarize,
} from "./adapters/openrouter";
export type {
	OpenRouterGatewayConfig,
	OpenRouterChatModel,
	OpenRouterImageModel,
	OpenRouterSummarizeModel,
} from "./adapters/openrouter";

export { createWorkersAiChat } from "./adapters/workers-ai";
export type { WorkersAiTextModel, WorkersAiTextModelOptions } from "./adapters/workers-ai";

export { createWorkersAiImage } from "./adapters/workers-ai-image";
export type { WorkersAiImageModel } from "./adapters/workers-ai-image";

export { createWorkersAiTranscription } from "./adapters/workers-ai-transcription";
export type { WorkersAiTranscriptionModel } from "./adapters/workers-ai-transcription";

export { createWorkersAiTts } from "./adapters/workers-ai-tts";
export type { WorkersAiTTSModel } from "./adapters/workers-ai-tts";

export { createWorkersAiSummarize } from "./adapters/workers-ai-summarize";
export type { WorkersAiSummarizeModel } from "./adapters/workers-ai-summarize";

// TODO: Workers AI embedding adapter is implemented in workers-ai-embedding.ts.
// Waiting on TanStack AI to add BaseEmbeddingAdapter / embed() / embedMany().

// Config types
export type { AiGatewayAdapterConfig, WorkersAiAdapterConfig } from "./utils/create-fetcher";
