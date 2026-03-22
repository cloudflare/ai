# @cloudflare/tanstack-ai

## 0.1.5

### Patch Changes

- [#457](https://github.com/cloudflare/ai/pull/457) [`cc94a06`](https://github.com/cloudflare/ai/commit/cc94a06ca85603e473f41cc12ed83f53cbe9e136) Thanks [@threepointone](https://github.com/threepointone)! - Fix request cancellation by propagating `abortSignal` to outbound network calls.

  **ai-gateway-provider**: Pass `abortSignal` to the `fetch` call (API path) and to `binding.run()` (binding path) so that cancelled requests are properly aborted.

  **workers-ai-provider**: Pass `abortSignal` to `binding.run()` for chat, embedding, and image models, matching the existing behavior in transcription, speech, and reranking models.

  **@cloudflare/tanstack-ai**: Pass `signal` through to `binding.run()` in both `createGatewayFetch` (AI Gateway binding path) and `createWorkersAiBindingFetch` (Workers AI binding path).

## 0.1.4

### Patch Changes

- [#448](https://github.com/cloudflare/ai/pull/448) [`054ccb8`](https://github.com/cloudflare/ai/commit/054ccb834ea3eb7a07d2b011e1ff1b8344f348fb) Thanks [@threepointone](https://github.com/threepointone)! - Fix image inputs for vision-capable chat models
  - Handle all `LanguageModelV3DataContent` variants (Uint8Array, base64 string, data URL) instead of only Uint8Array
  - Send images as OpenAI-compatible `image_url` content parts inline in messages, enabling vision for models like Llama 4 Scout and Kimi K2.5
  - Works with both the binding and REST API paths

## 0.1.3

### Patch Changes

- [#435](https://github.com/cloudflare/ai/pull/435) [`7381171`](https://github.com/cloudflare/ai/commit/738117115f7d35317d1fd39d8096d9cfe082633e) Thanks [@mdhruvil](https://github.com/mdhruvil)! - Fix workers-ai adapter silently dropping image content parts.

- [#424](https://github.com/cloudflare/ai/pull/424) [`b2eeca8`](https://github.com/cloudflare/ai/commit/b2eeca868c07cf4e817134cadb9c24b8aa9bb5a8) Thanks [@vaibhavshn](https://github.com/vaibhavshn)! - Avoid duplicate tool call IDs by generating unique IDs per tool call index instead of trusting backend-provided IDs

- [#411](https://github.com/cloudflare/ai/pull/411) [`af08464`](https://github.com/cloudflare/ai/commit/af08464545fc9b9fdb722c681496947c0ff61455) Thanks [@baldyeagle](https://github.com/baldyeagle)! - Annotate createAnthropicChat to improve client type narrowing

- [#398](https://github.com/cloudflare/ai/pull/398) [`40e53c8`](https://github.com/cloudflare/ai/commit/40e53c851cd0c1cc80d0c44b1146ef564da782bc) Thanks [@vaibhavshn](https://github.com/vaibhavshn)! - fix: add `run/` prefix to workers-ai gateway endpoint and make API key optional for gateway bindings

- [#444](https://github.com/cloudflare/ai/pull/444) [`414b4d5`](https://github.com/cloudflare/ai/commit/414b4d5eb9ecec3e69b39c03fb4532afc1fae015) Thanks [@mchenco](https://github.com/mchenco)! - Add `sessionAffinity` option to `WorkersAiAdapterConfig` for prefix-cache optimization. Routes requests with the same key to the same backend replica via the `x-session-affinity` header. Supported across binding, REST, and gateway modes.

## 0.1.2

### Patch Changes

- [#406](https://github.com/cloudflare/ai/pull/406) [`9af703b`](https://github.com/cloudflare/ai/commit/9af703b93df4a6c7f4a1d10f895d488344b71425) Thanks [@vaibhavshn](https://github.com/vaibhavshn)! - Pass API Key properly for Gemini Tanstack AI Adapter

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
