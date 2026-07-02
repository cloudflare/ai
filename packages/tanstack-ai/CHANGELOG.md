# @cloudflare/tanstack-ai

## 0.2.1

### Patch Changes

- [#599](https://github.com/cloudflare/ai/pull/599) [`c72bb8b`](https://github.com/cloudflare/ai/commit/c72bb8bb325adfdd2ee39e78fda6b8bdb0934782) Thanks [@threepointone](https://github.com/threepointone)! - fix: default third-party catalog slugs to the account gateway on the Workers AI binding path

  `createWorkersAiChat` in plain binding mode (`{ binding: env.AI }`, no `gateway`) called `env.AI.run(model, inputs)` with no gateway. That works for `@cf/*` models, but third-party `"<vendor>/<model>"` unified-billing catalog slugs (e.g. `deepseek/deepseek-v4-pro`) must route through an AI Gateway, so they never engaged unified billing.

  The binding shim now detects a non-`@cf`/non-`dynamic` catalog slug and defaults it to the account `"default"` gateway (an explicitly configured `gateway` still wins). `@cf/*` and `dynamic/*` models keep the plain binding path unchanged. Resume only engages when a gateway was explicitly configured — the catalog auto-default is a routing concern, not a resume opt-in.

## 0.2.0

### Minor Changes

- [#590](https://github.com/cloudflare/ai/pull/590) [`fe0d182`](https://github.com/cloudflare/ai/commit/fe0d182d18fd058f562973d4d0b22312aa9a9c25) Thanks [@threepointone](https://github.com/threepointone)! - - Add **resumable streaming** to the Workers AI adapter (**coming soon** — not
  generally available yet while the AI Gateway resume backend rolls out; treat as
  experimental): catalog models dispatch through the AI Gateway run path, so
  transient mid-stream drops reconnect transparently via `cf-aig-run-id`.
  Configure with `resume` / `onResumeExpired` (no-op + warning where no run id is
  available, e.g. REST).

  - Gain the gpt-oss **forced tool-call salvage** ([#560](https://github.com/cloudflare/ai/issues/560)) and non-SSE
    graceful-degradation, now shared with `workers-ai-provider`.
  - Bump `@tanstack/ai` and the `@tanstack/ai-*` adapter peers to current versions
    (adapts to the multimodal `MediaPrompt` API). `@ai-sdk/*` is intentionally not
    bumped.

- [#594](https://github.com/cloudflare/ai/pull/594) [`12fb307`](https://github.com/cloudflare/ai/commit/12fb3075d253ab8034b1c7b6e41ff94be17dde88) Thanks [@threepointone](https://github.com/threepointone)! - Retry transient Workers AI failures and normalize errors across every adapter.

  - **Chat**: the binding shim now surfaces binding failures as HTTP responses
    (e.g. "out of capacity" `3040` → `429`, "no such model" `5007` → `400`) so the
    OpenAI SDK's status-based retry engages and honors `Retry-After`. Aborts and
    unrecognized errors propagate untouched. Non-OK gateway run-path responses are
    returned verbatim instead of being swallowed into an empty completion.
  - **Non-chat** adapters (embedding, image, TTS, transcription, summarize) gain a
    bounded exponential-backoff retry (the OpenAI SDK isn't in play for these) and
    normalize binding / REST / gateway failures into a single `WorkersAiRequestError`
    carrying the HTTP `status` (and the raw Workers AI `code` when recognized). The
    retry loop honors a server `Retry-After` header. Non-OK gateway responses are no
    longer swallowed.
  - Add a `maxRetries` option to the adapter config: forwarded to the OpenAI SDK on
    the chat path, and used by the non-chat retry loop. Defaults to `2`; set to `0`
    to disable.

## 0.1.10

### Patch Changes

- [#570](https://github.com/cloudflare/ai/pull/570) [`104c4a7`](https://github.com/cloudflare/ai/commit/104c4a70f057c75b9c70e0b3c1a0bc87fd10dbd3) Thanks [@threepointone](https://github.com/threepointone)! - Update for the latest `@tanstack/ai` adapter API and refresh Workers AI model references.

  - Use the new provider summarize factory functions (`createAnthropicSummarize`, `createGeminiSummarize`, `createGrokSummarize`, `createOpenaiSummarize`, `createOpenRouterSummarize`) instead of the removed `*SummarizeAdapter` classes, and give the gateway `create*Summarize` wrappers explicit `AnySummarizeAdapter` return types so declaration files generate cleanly.
  - Migrate the Workers AI streaming adapter to the `EventType` enum and the updated `TextOptions` shape (sampling knobs such as `temperature`/`max_tokens` now flow through `modelOptions`; `systemPrompts` accepts `SystemPrompt` objects).
  - Align the image, transcription, and TTS adapters with the new `(model, config?)` base-adapter constructor signature.
  - Update default/example Workers AI model references to current models (`@cf/google/gemma-4-26b-a4b-it`, `@cf/moonshotai/kimi-k2.7-code`), replacing deprecated ones.

- [#572](https://github.com/cloudflare/ai/pull/572) [`667873f`](https://github.com/cloudflare/ai/commit/667873f7f1209fcc9f27112e81e65ccc4d4e37dd) Thanks [@threepointone](https://github.com/threepointone)! - Fix broken streamed tool calls in the Workers AI adapter ([#523](https://github.com/cloudflare/ai/issues/523)).

  Some Workers AI models stream a tool call's argument fragments before the function `name` arrives. The adapter buffers those fragments while waiting for the name (it must, because TanStack AI's `StreamProcessor` reads the tool name only once, from `TOOL_CALL_START`), but it previously dropped the buffered prefix and forwarded only the post-name fragment. The result was a `tool-call` message part with truncated/empty `arguments` (and, in earlier versions, a missing `name`), so tool dispatch silently failed.

  The adapter now tracks how many argument characters have been emitted and flushes any buffered fragments via `TOOL_CALL_ARGS` as soon as `TOOL_CALL_START` is emitted, guaranteeing the full argument string and the tool name reach the consumer regardless of the order in which the model streams `name` and `arguments`.

## 0.1.9

### Patch Changes

- [#518](https://github.com/cloudflare/ai/pull/518) [`4358cc1`](https://github.com/cloudflare/ai/commit/4358cc1b4dffdca44784300d0c04552b64157bdd) Thanks [@zackarychapple](https://github.com/zackarychapple)! - Widen `@tanstack/ai` peer dependency and optional adapter ranges to accept newer 0.x releases (up to but not including 1.0.0). Previously the caret ranges on pre-1.0 versions resolved to a single minor (e.g. `^0.8.0` only allowed `>=0.8.0 <0.9.0`), causing unmet-peer warnings when consumers installed `@tanstack/ai@0.14.0` and matching adapter versions.

## 0.1.8

### Patch Changes

- [#505](https://github.com/cloudflare/ai/pull/505) [`f43f6f0`](https://github.com/cloudflare/ai/commit/f43f6f0c5f71f78e0ea7ca9f6fb5af965e46500c) Thanks [@threepointone](https://github.com/threepointone)! - Add passthrough for `reasoning_effort` and `chat_template_kwargs` in `createWorkersAiChat`. Pass them per-call through `modelOptions`:

  ```ts
  const adapter = createWorkersAiChat("@cf/zai-org/glm-4.7-flash", {
    binding: env.AI,
  });

  chat({
    adapter,
    messages,
    modelOptions: {
      reasoning_effort: "low",
      chat_template_kwargs: { enable_thinking: false },
    },
  });
  ```

  Previously these fields were silently dropped, which could cause reasoning models (GLM-4.7-flash, Kimi K2.5/K2.6, GPT-OSS) to burn the entire output token budget on chain-of-thought with no visible content. They now reach `binding.run(model, inputs)` at the `inputs` level as required by Workers AI.

  A new `WorkersAiTextModelOptions` type is exported from `@cloudflare/tanstack-ai` and `@cloudflare/tanstack-ai/adapters/workers-ai`.

  Closes [#503](https://github.com/cloudflare/ai/issues/503).

## 0.1.7

### Patch Changes

- [#474](https://github.com/cloudflare/ai/pull/474) [`dc95a5f`](https://github.com/cloudflare/ai/commit/dc95a5fb65e472f610247d55bae0774914fe06ce) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

- [#461](https://github.com/cloudflare/ai/pull/461) [`9131bb4`](https://github.com/cloudflare/ai/commit/9131bb470663908632f2c86ef552dc9eae56194c) Thanks [@threepointone](https://github.com/threepointone)! - Replace tsup with tsdown as the build tool

## 0.1.6

### Patch Changes

- [#459](https://github.com/cloudflare/ai/pull/459) [`a375d3f`](https://github.com/cloudflare/ai/commit/a375d3f70a27a6f2a937557aa4d08d06b875c1e1) Thanks [@TimoWilhelm](https://github.com/TimoWilhelm)! - Add maxTokens support to WorkersAi chat and handle non-string responses
  - Forward `maxTokens` from `TextOptions` to the Workers AI binding as `max_tokens` in both streaming and non-streaming paths.
  - Stringify object responses from the binding when building assistant messages instead of defaulting to empty string.

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
