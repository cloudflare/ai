# @cloudflare/tanstack-ai

## 0.1.2

### Patch Changes

- [#400](https://github.com/cloudflare/ai/pull/400) [`8822603`](https://github.com/cloudflare/ai/commit/882260300ccbf78a8c40e5ce54a49d02c7ad3c8c) Thanks [@threepointone](https://github.com/threepointone)! - Add config validation to all Workers AI adapter constructors that throws a clear error when neither a binding, credentials (accountId + apiKey), nor a gateway configuration is provided. Widen all model type parameters (WorkersAiTextModel, WorkersAiImageModel, WorkersAiEmbeddingModel, WorkersAiTranscriptionModel, WorkersAiTTSModel, WorkersAiSummarizeModel) to accept arbitrary strings while preserving autocomplete for known models.

## 0.1.1

### Patch Changes

- [#396](https://github.com/cloudflare/ai/pull/396) [`2fb3ca8`](https://github.com/cloudflare/ai/commit/2fb3ca80542c8335fea83cac314fa52da772f38f) Thanks [@threepointone](https://github.com/threepointone)! - - Update model recommendations: Aura-2 EN for TTS, Llama 4 Scout for chat examples
  - Add Aura-2 EN/ES to TTS model type
  - Preserve image/vision content in user messages instead of stripping to text-only
  - Add non-streaming fallback when REST streaming fails (GPT-OSS, Kimi)
  - Warn on premature stream termination instead of silently reporting "stop"
  - Consistent console.warn prefix for SSE parse errors
  - Move @cloudflare/workers-types from optionalDependencies to devDependencies (types-only, no runtime use)
  - Fix @openrouter/sdk version mismatch type errors

## 0.1.0

### Minor Changes

- [#389](https://github.com/cloudflare/ai/pull/389) [`a4b756e`](https://github.com/cloudflare/ai/commit/a4b756ebce97c4fa3e376293b0100d7784a15654) Thanks [@vaibhavshn](https://github.com/vaibhavshn)! - Add `@cloudflare/tanstack-ai` — adapters for using TanStack AI with Cloudflare Workers AI and AI Gateway.

  ### Workers AI adapters

  All Workers AI adapters support four configuration modes: plain binding (`env.AI`), plain REST (account ID + API key), AI Gateway binding (`env.AI.gateway(id)`), and AI Gateway REST (account ID + gateway ID).

  - **Chat** (`createWorkersAiChat`) — Streaming chat completions via the OpenAI-compatible API. Includes tool calling with full round-trip support, structured output via `json_schema`, and reasoning text streaming (`STEP_STARTED`/`STEP_FINISHED` AG-UI events) for models like QwQ, DeepSeek R1, and Kimi K2.5. A custom fetch shim translates OpenAI SDK calls to `env.AI.run()` for binding mode, with a stream transformer that handles both Workers AI native format and OpenAI-compatible format.
  - **Image generation** (`createWorkersAiImage`) — Stable Diffusion and other text-to-image models.
  - **Transcription** (`createWorkersAiTranscription`) — Speech-to-text via Whisper and Deepgram Nova-3.
  - **Text-to-speech** (`createWorkersAiTts`) — Audio generation via Deepgram Aura-1.
  - **Summarization** (`createWorkersAiSummarize`) — Text summarization via BART-large-CNN.
  - **Embeddings** (`createWorkersAiEmbedding`) — Text embeddings (implemented but not yet exported, pending TanStack AI's `BaseEmbeddingAdapter`).

  ### AI Gateway adapters (third-party providers)

  Route requests through Cloudflare AI Gateway for caching, rate limiting, and unified billing. Each adapter injects a custom `fetch` (or `httpOptions` for Gemini) that handles both binding and credential-based gateway configurations.

  - **OpenAI** — Chat, summarize, image, transcription, TTS, video (`createOpenAi*`)
  - **Anthropic** — Chat, summarize (`createAnthropic*`)
  - **Gemini** — Chat, summarize, image, TTS (`createGemini*`). Credentials-only (Google GenAI SDK lacks custom fetch support).
  - **Grok** — Chat, summarize, image (`createGrok*`)
  - **OpenRouter** — Chat, summarize, image (`createOpenRouter*`). Accepts any model string.

  ### Utilities

  - `createGatewayFetch` — Shared fetch factory that routes requests through AI Gateway (binding or REST), with support for cache control headers (`skipCache`, `cacheTtl`, `customCacheKey`, `metadata`).
  - `createWorkersAiBindingFetch` — Fetch shim that makes `env.AI` look like an OpenAI endpoint, including stream transformation and tool call ID sanitization for the binding's strict `[a-zA-Z0-9]{9}` validation.
  - Config detection helpers (`isDirectBindingConfig`, `isDirectCredentialsConfig`, `isGatewayConfig`) using structural typing to discriminate `env.AI` from `env.AI.gateway(id)`.
  - Shared binary utilities for normalizing Workers AI responses (Uint8Array, ArrayBuffer, ReadableStream, JSON wrapper) to base64.

  ### Robustness

  - Premature stream termination detection — if Workers AI truncates a response or the connection drops (no `finish_reason`), the adapter emits proper closing events so consumers don't hang.
  - Graceful non-streaming fallback — if a model returns a complete response despite `stream: true`, the binding shim wraps it into a valid response.
  - Deepgram Nova-3 transcription uses raw binary audio via REST (not JSON), automatically detected by model name.

  ### Testing

  - Comprehensive unit tests (186 tests) covering all adapters, config modes, stream transformation, message building, tool calling, reasoning events, premature termination, and public API surface.
  - E2E integration tests against real Workers AI APIs (both binding and REST paths) across 12 chat models + 4 transcription models + image/TTS/summarize, validating chat, multi-turn, tool calling, tool round-trips, structured output, reasoning, and all non-chat capabilities.
  - Tree-shakeable package exports with per-adapter entry points for ESM and CJS.
