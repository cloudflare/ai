# workers-ai-provider

## 4.0.0

### Major Changes

- [#601](https://github.com/cloudflare/ai/pull/601) [`7a6f8dd`](https://github.com/cloudflare/ai/commit/7a6f8ddac6c38483da023201303b53d10c266860) Thanks [@OskarLebuda](https://github.com/OskarLebuda)! - Add support for AI SDK 7

  Bumps peer dependencies to require `ai@^7` and `@ai-sdk/provider@^4`. This is a breaking change for users on AI SDK 6, who should stay on the previous major version of these packages.

### Patch Changes

- [#602](https://github.com/cloudflare/ai/pull/602) [`2e64811`](https://github.com/cloudflare/ai/commit/2e648116daa6a2e979508157f31274956ffbac26) Thanks [@aninibread](https://github.com/aninibread)! - Docs: point AI Search users to the new dedicated `ai-search-provider` package for Cloudflare's new `ai_search` and `ai_search_namespaces` Workers bindings. `createAISearch` and `createAutoRAG` in this package continue to wrap the legacy `AutoRAG` binding, unchanged.

## 3.3.1

### Patch Changes

- [#599](https://github.com/cloudflare/ai/pull/599) [`c72bb8b`](https://github.com/cloudflare/ai/commit/c72bb8bb325adfdd2ee39e78fda6b8bdb0934782) Thanks [@threepointone](https://github.com/threepointone)! - fix: route native unified-billing catalog slugs (e.g. `deepseek/deepseek-v4-pro`) through the run path

  `workers-ai-provider@3.2.x` began treating any `"<vendor>/<model>"` id as a third-party AI Gateway catalog slug. This regressed models like `deepseek/deepseek-v4-pro` that Cloudflare serves natively on the unified-billing run path (`env.AI.run`): without `providers` the provider threw at construction, and with `providers: [openai]` it routed to the gateway universal `chat/completions` (BYOK) endpoint and returned auth errors.

  `deepseek/*` is now on the unified run catalog (defaults to `env.AI.run`), matching pre-3.2 behavior. Unified-billing eligibility is decided per-model by Cloudflare's catalog, so BYOK-only deepseek models (e.g. `deepseek/deepseek-chat`) still work by opting into the gateway path per call (`transport: "gateway"` / `byok`). The rest of the OpenAI-wire long tail (`mistral`, `perplexity`, `cerebras`, `openrouter`, `fireworks`) is not on Cloudflare's unified run catalog — `env.AI.run` returns model-not-found for those — so they remain BYOK gateway-path providers.

  When no `providers` are configured, a bare `"<vendor>/<model>"` id is now routed through the same hardened run path as `dynamic/*` routes: the gateway defaults to the account's `"default"` gateway (third-party unified billing needs one), `cacheTtl`/`skipCache`/`metadata`/`collectLog` are applied to the gateway options, and delegate-only options (`byok`, `transport: "gateway"`, `fallback`, `resume`, resume callbacks) now throw a clear error instead of being silently dropped.

## 3.3.0

### Minor Changes

- [#590](https://github.com/cloudflare/ai/pull/590) [`fe0d182`](https://github.com/cloudflare/ai/commit/fe0d182d18fd058f562973d4d0b22312aa9a9c25) Thanks [@threepointone](https://github.com/threepointone)! - The AI Gateway delegate gains cross-vendor server-side fallback
  (`fallback: { mode: "server" }`) — multiple vendors in one gateway run, with the
  winner selected via `cf-aig-step`.

  The gateway delegate now reaches header parity with the run path: the gateway
  path forwards `cacheKey`, `eventId`, `requestTimeoutMs`, and `retries` from the
  gateway options as `cf-aig-*` headers, and `DelegateCallOptions` gains two new
  universal-endpoint controls — `byokAlias` (`cf-aig-byok-alias`, select a stored
  BYOK key by alias) and `zdr` (`cf-aig-zdr`, per-request Zero Data Retention
  override for Unified Billing, applied on both transports).

  Internally, the provider registry, `cf-aig-*` header building, resumable-stream
  engine, and Workers AI SSE helpers are now shared across the Cloudflare AI
  packages (bundled inline — no new dependency for you to install).

- [#593](https://github.com/cloudflare/ai/pull/593) [`1c6afd0`](https://github.com/cloudflare/ai/commit/1c6afd06ee2a9089072fd00349a3eca4077d523a) Thanks [@threepointone](https://github.com/threepointone)! - Native Workers AI failures are now surfaced as AI SDK `APICallError`s so the AI
  SDK's built-in retry (`maxRetries`) can engage on transient errors.

  Previously the binding path (`env.AI.run`) threw plain `Error`s and the REST
  path threw a generic `Error`, so the AI SDK never retried them — most notably
  the common **"out of capacity"** failure (internal code `3040`, HTTP `429`) and
  other 5xx blips just failed the call outright.

  - **Binding path**: errors thrown by `env.AI.run` are normalized into an
    `APICallError` across every Workers AI model — chat, embedding, image, speech,
    transcription, and reranking. The Workers AI internal error code is parsed from
    the message (or a numeric `code` property) and mapped to the documented HTTP
    status (e.g. `3040`/`3036` → `429`, `3007`/`3008` → `408`, `5007` → `400`), and
    `APICallError` derives `isRetryable` from that status (retryable on
    408/409/429/5xx). Unrecognized errors get no status and stay non-retryable
    (prior behavior). `AbortError`/`TimeoutError` cancellations propagate
    unchanged.
  - **REST path**: non-OK responses now throw an `APICallError` carrying the real
    `statusCode`, response headers (so `Retry-After` is honored), and body, instead
    of a generic `Error`. The error message keeps the same
    `Workers AI API error (<status> <statusText>): <body>` shape.

  This means transient capacity/5xx errors are now automatically retried with
  exponential backoff by `generateText`/`streamText` (default 2 retries; tune via
  `maxRetries`). Set `maxRetries: 0` to opt out.

## 3.2.1

### Patch Changes

- [#585](https://github.com/cloudflare/ai/pull/585) [`bbcc4d1`](https://github.com/cloudflare/ai/commit/bbcc4d1f64729abb00aa42b1bec8f66ae0e0fb6a) Thanks [@threepointone](https://github.com/threepointone)! - fix(workers-ai-provider): pass dynamic AI Gateway routes through Workers AI

## 3.2.0

### Minor Changes

- [#573](https://github.com/cloudflare/ai/pull/573) [`4f19489`](https://github.com/cloudflare/ai/commit/4f19489ee6d6060302cf14ed3621716d755cd936) Thanks [@threepointone](https://github.com/threepointone)! - Add AI Gateway routing for third-party catalog models to `createWorkersAI`, with capability-driven transport selection, the full provider registry, a bring-your-own-provider wrapper, typed errors, and client/server fallback.

  **Experimental.** This is a substantial new surface for the package — well beyond its original job of wrapping Workers AI — and several behaviors rely on undocumented AI Gateway internals (the `cf-aig-run-id` resume buffer, per-provider run-path wire formats). Treat the entire third-party / gateway surface as experimental: the API may change, and provider coverage maturity varies (only the run-catalog providers are live-verified end-to-end). It does not affect the existing stable Workers AI / AI Search APIs.

  `createWorkersAI` is the single public entry point. Pass an optional `providers` array (wire-format plugins from the sub-paths below). When set, a `"<provider>/<model>"` catalog slug passed to the provider (or `.chat`) is routed through AI Gateway automatically, while `@cf/...` ids continue to build Workers AI models. Each slug is resolved against a registry of every AI Gateway provider, and the transport is picked from the requested options: the **run path** (`env.AI.run`) for resumable streaming (`cf-aig-run-id`, the default, on the unified-billing run catalog), or the **gateway path** (`env.AI.gateway(id).run([…])`) for BYOK providers, server-side fallback, and caching. Incompatible option combinations (e.g. `resume: true` with `fallback.mode: "server"`, or `resume`/`transport: "run"` on a BYOK provider) throw a clear `GatewayDelegateError`; resume-disabling combinations warn loudly. This is fully additive: leaving `providers` unset preserves the prior behavior exactly, and passing a catalog slug without it throws a helpful error. The chat factory's settings argument is typed from the model id literal — a `"<provider>/<model>"` slug autocompletes `DelegateCallOptions`, while a `@cf/...` id autocompletes `WorkersAIChatSettings`. `gateway` is optional for catalog routing — when unset, requests use the account's `"default"` AI Gateway; set `gateway` (here or per call) to target a specific one.

  New sub-path exports:

  - `workers-ai-provider/openai`, `workers-ai-provider/anthropic`, `workers-ai-provider/google` — provider plugins keyed by **wire format**. One `openai` plugin serves the OpenAI-compatible long tail (`deepseek`, `xai`/`grok`, `groq`, `mistral`, `perplexity`, `cerebras`, `openrouter`, `fireworks`) plus the unified-catalog chat providers `alibaba` (Qwen) and `minimax`. `@ai-sdk/openai`, `@ai-sdk/anthropic`, and `@ai-sdk/google` are **optional** peer dependencies; install only the ones whose wire formats you use. The `openai` plugin is required for the run path (see below). Providers whose gateway-path URL isn't reproducible from the shared builder (cohere, baseten, parallel, azure-openai, google-vertex) and provider-native/non-chat providers are bring-your-own-provider only.
  - `workers-ai-provider/gateway` — `createGatewayFetch` / `createGatewayProvider` wrap any `@ai-sdk/*` provider so its traffic flows through AI Gateway (provider id detected from the request URL, or set explicitly). Use it for provider-native or non-chat providers the slug routing can't auto-wire (bedrock, replicate, audio/image), or for full control of the underlying provider.

  The transport types, error classes (`WorkersAIGatewayError`, `WorkersAIFallbackError`, `GatewayDelegateError`), the registry helpers, `DelegateCallOptions`, and `createResumableStream` are re-exported from the package root.

  Features:

  - **Provider registry** (`GATEWAY_PROVIDERS`, `findProviderBySlug`, `detectProviderByUrl`) maps slugs to gateway provider ids, wire formats, billing model, and run-catalog membership. Covers every provider in the AI Gateway directory (OpenAI, Anthropic, Google AI Studio/Vertex, xAI, Groq, DeepSeek, Mistral, Perplexity, Cerebras, OpenRouter, Cohere, Baseten, Parallel, Azure OpenAI, Amazon Bedrock, HuggingFace, Replicate, Fal, Ideogram, Cartesia, Deepgram, ElevenLabs — plus Fireworks), with URL host patterns so `createGatewayFetch` auto-detects each from the wrapped provider's request URL. Also includes the unified-catalog chat providers `alibaba` (Qwen) and `minimax` on the resumable run catalog (verified live: OpenAI-wire, `cf-aig-run-id` on streams); these are run-path only (`gatewayPath: false` — not native gateway providers), so caching, server-side fallback, and `transport: "gateway"` are rejected with a clear `GatewayDelegateError` instead of failing upstream.
  - **Metadata & logging** — `metadata` (custom log attributes for spend attribution) and `collectLog` are first-class call options on both transports. On the run path they fold into the typed gateway options; on the gateway path they become `cf-aig-metadata` / `cf-aig-collect-log` headers (bigint metadata values are coerced to strings). Call-level `metadata` merges over (and wins against) any `metadata` set via `gateway: { metadata }`.
  - **BYOK** — set `byok: true` (+ supply the key via `extraHeaders`) to forward the upstream provider key on the gateway path; otherwise provider auth headers are stripped so unified billing / the gateway's stored key applies.
  - **Client-side fallback** (`fallback.mode: "client"`) keeps resume per leg — a failed pre-stream dispatch falls through to the next model; if all fail, a `WorkersAIFallbackError` carries the per-attempt tree. **Server-side fallback** (`fallback.mode: "server"`) routes same-vendor fallbacks through the gateway path.
  - **Typed errors** — `WorkersAIGatewayError` (with a coarse `code`, a `recoverable` hint, and the parsed CF/provider envelope) and `WorkersAIFallbackError` (attempt tree). Helpers `classifyStatus` / `extractErrorMessage` are exported.
  - **Abort + gateway options** are passed through on both transports.

  On the run path, the response stream is wrapped so a transient mid-stream drop reconnects through the gateway resume endpoint (`resume?from=N`) transparently — the `@ai-sdk` parser never sees the break. `from` is an SSE event index, so the wrapper emits only complete events and realigns on the boundary after a drop (no duplicated or truncated bytes). When the gateway buffer expires (404, ~5.5 min TTL), an `onResumeExpired` policy controls whether the stream errors (`"error"`, the default) or ends with partial output (`"accept-partial"`).

  For cross-invocation recovery (e.g. a new Durable Object invocation after eviction), `createResumableStream` is exported and accepts no `initial` body plus a `fromEvent` offset — it re-attaches by resuming directly from that event index. An `onProgress(eventOffset)` callback (also surfaced on the delegate as a call option) reports the live SSE event offset so callers can persist `{ runId, eventOffset }` and re-attach later.

  **Run-path wire format (per-provider):** on the resumable run path (`env.AI.run`), Cloudflare's unified catalog normalizes most providers to OpenAI chat-completions wire (so `google/…` is parsed with the `openai` plugin on the run path, even though the gateway path uses the native `google` plugin), but passes **Anthropic through natively** (`content[].text`, native tool shape) — so `anthropic/…` is parsed with the `anthropic` plugin on both paths. The registry records this as `runWireFormat` (defaults to `"openai"`). Include `openai` for the openai-wire run-path providers (openai, google, xai/grok, groq) and `anthropic` to use `anthropic/…`; the delegate throws a clear `GatewayDelegateError` naming the exact plugin a transport needs if it's missing.

### Patch Changes

- [#563](https://github.com/cloudflare/ai/pull/563) [`231c19b`](https://github.com/cloudflare/ai/commit/231c19b733c1332aa63bd29d71a178a46f68ffc7) Thanks [@slegarraga](https://github.com/slegarraga)! - Validate `file` parts in chat messages before sending them to Workers AI.

  Previously every `file` part in a user message was unconditionally wrapped as
  an `image_url`, regardless of its `mediaType`. Non-image files (e.g.
  `application/pdf`, `audio/*`, `video/*`, `application/octet-stream`) were
  forwarded as if they were valid vision inputs, and a missing `mediaType`
  silently defaulted to `image/png`, producing a corrupt data URL.

  Now `convertToWorkersAIChatMessages`:

  - throws an `UnsupportedFunctionalityError` when a `file` part has a
    non-`image/*` `mediaType`, or no `mediaType` at all, instead of forwarding
    broken multimodal content;
  - matches the `image/` prefix case-insensitively (per RFC 2045), so media
    types such as `IMAGE/JPEG` are accepted while the caller's original casing
    is preserved in the emitted data URL;
  - preserves the provided image `mediaType` instead of defaulting missing
    media types to `image/png`.

  This is a behavior change: inputs that previously "succeeded" with broken or
  defaulted media types now throw a clear, catchable error. Type-correct callers
  (the AI SDK always sets `mediaType` on file parts) are unaffected for valid
  image inputs.

- [#575](https://github.com/cloudflare/ai/pull/575) [`65e0735`](https://github.com/cloudflare/ai/commit/65e0735fc2788666376d7cecf2c198f814e2eb54) Thanks [@threepointone](https://github.com/threepointone)! - Map the AI SDK's forced single-tool choice to the documented named-function form.

  Previously `toolChoice: { type: "tool", toolName }` was downgraded to
  `tool_choice: "required"` (with the tool list filtered to the single function).
  Workers AI treats `"required"` as advisory: on long contexts and reasoning
  models (e.g. `@cf/google/gemma-4-26b-a4b-it`, `@cf/qwen/qwq-32b`,
  `@cf/qwen/qwen3-30b-a3b-fp8`) the model would "fail open" and answer in prose
  instead of calling the requested tool.

  Now the provider sends the OpenAI-style named-function form
  `tool_choice: { type: "function", function: { name } }`, which Workers AI
  enforces server-side, and keeps the full tool list (matching OpenAI semantics
  and preserving tool-result context fidelity).

  Note: forcing a tool on a reasoning model with insufficient `max_tokens` is
  validated server-side and now surfaces as a clear error (Workers AI `8006`)
  rather than silently producing no tool call.

  Additionally, recover forced tool calls that gpt-oss models leak as text.
  When a tool is forced, gpt-oss (harmony format) sometimes emits the tool call
  as raw JSON in `message.content` with an empty `tool_calls` array and
  `finish_reason: "stop"`. The provider now detects this — only when a tool was
  forced and the leaked JSON's `name` matches a requested tool — and
  reinterprets it as a structured tool call (with `finishReason: "tool-calls"`
  and a warning), across both `generateText` and `streamText`. Ambiguous leaks
  (harmony channel/role names, hallucinated names) are left untouched to avoid
  fabricating bogus calls.

- [#570](https://github.com/cloudflare/ai/pull/570) [`104c4a7`](https://github.com/cloudflare/ai/commit/104c4a70f057c75b9c70e0b3c1a0bc87fd10dbd3) Thanks [@threepointone](https://github.com/threepointone)! - Refresh Workers AI model references from the deprecated `@cf/moonshotai/kimi-k2.5` to the current `@cf/moonshotai/kimi-k2.7-code` in the README and inline source documentation.

- [#576](https://github.com/cloudflare/ai/pull/576) [`a360e7a`](https://github.com/cloudflare/ai/commit/a360e7aff44c0a27ea7a9a9378722fa39837574f) Thanks [@threepointone](https://github.com/threepointone)! - Keep structured-output `name`/`description` instead of dropping them on native Workers AI models.

                      `Output.object({ schema, name, description })` and `generateObject({ schema,

                schemaName, schemaDescription })`pass a`name`/`description`alongside the JSON

      schema. On the native`@cf/...`path the provider previously forwarded only the
      bare schema as`response_format.json_schema` and silently discarded both.

                      Native Workers AI expects `json_schema` to be a **bare** JSON Schema, not
                      OpenAI's `{ name, schema, strict }` envelope, so we can't just wrap it (that
                      would break native models). Instead the `name` is folded into the schema's
                      standard `title` keyword and the `description` into its `description` keyword —
                      the payload stays a valid bare schema while the guidance reaches the model.
                      Existing schema-level `title`/`description` are never overwritten and the input
                      schema is not mutated.

                      Note on issue [#559](https://github.com/cloudflare/ai/issues/559): the reported failure was OpenAI partner models (e.g.
                      `openai/gpt-5.4-mini`) rejecting requests with `Missing required parameter:

                'response_format.json_schema.name'`. Partner-model slugs are no longer handled

      by this code path at all — they route through the AI Gateway delegate and the
      real `@ai-sdk/\*`providers, which build the required`json_schema.name`envelope
      themselves (configure them via`createWorkersAI({ binding, providers: [openai]

  })`). This change covers the remaining native-model gap where that guidance was
  being dropped.

                      See https://github.com/cloudflare/ai/issues/559.

## 3.1.14

### Patch Changes

- [#527](https://github.com/cloudflare/ai/pull/527) [`cc4b2c0`](https://github.com/cloudflare/ai/commit/cc4b2c074b5ad01460c2fe3939b9db55df836ca8) Thanks [@mkgada](https://github.com/mkgada)! - Rewrite Workers AI tool call IDs exposed to the AI SDK and restore the original provider IDs when building follow-up prompts to avoid collisions across chat turns.

## 3.1.13

### Patch Changes

- [#510](https://github.com/cloudflare/ai/pull/510) [`dfd2cb4`](https://github.com/cloudflare/ai/commit/dfd2cb4e6e10e2ec3dc149bbc344b34a63734d07) Thanks [@Specy](https://github.com/Specy)! - Map `inputTokens.cacheRead` and `inputTokens.noCache` from Workers AI's `usage.prompt_tokens_details.cached_tokens` instead of always reporting them as `undefined`. This makes prompt-cache hits visible to consumers that compute pricing or telemetry from `LanguageModelV3Usage` (`generateText`/`streamText` `result.usage`).

  `cached_tokens` is treated as `cacheRead`; `cacheWrite` remains `undefined` because the OpenAI-style usage shape Workers AI returns does not distinguish cache reads from writes.

  Closes [#509](https://github.com/cloudflare/ai/issues/509).

## 3.1.12

### Patch Changes

- [#504](https://github.com/cloudflare/ai/pull/504) [`e9b2a9a`](https://github.com/cloudflare/ai/commit/e9b2a9a4e4e63a8c045c1ac9e5d07fec3d4f2535) Thanks [@threepointone](https://github.com/threepointone)! - Forward `reasoning_effort` and `chat_template_kwargs` onto `binding.run(model, inputs)`'s `inputs` object instead of silently dropping them into the options arg / REST query string. This fixes reasoning models (GLM-4.7-flash, Kimi K2.5/K2.6, GPT-OSS, QwQ) burning the entire output token budget on chain-of-thought with no visible content.

  Both settings-level and per-call usage are supported:

  ```ts
  // Settings-level
  const model = workersai("@cf/zai-org/glm-4.7-flash", {
    reasoning_effort: "low",
    chat_template_kwargs: { enable_thinking: false },
  });

  // Per-call (overrides settings)
  await generateText({
    model,
    prompt,
    providerOptions: {
      "workers-ai": { reasoning_effort: "low" },
    },
  });
  ```

  `reasoning_effort: null` is preserved as-is (explicit "disable reasoning" signal). The two fields are also typed directly on `WorkersAIChatSettings`.

  Closes [#501](https://github.com/cloudflare/ai/issues/501).

## 3.1.11

### Patch Changes

- [#494](https://github.com/cloudflare/ai/pull/494) [`ed6112a`](https://github.com/cloudflare/ai/commit/ed6112a7938ea3b9136876edb6830f3f1138d2b4) Thanks [@threepointone](https://github.com/threepointone)! - Emit `tool-input-end` and `tool-call` events eagerly when streaming multiple tool calls, instead of deferring all of them to stream close. Previously, all tool calls appeared "in progress" simultaneously because `tool-input-end` was only emitted in `flush()`. Now each tool call is closed as soon as the next one starts or a null finalization chunk is received, matching the behavior of other AI SDK providers.

## 3.1.10

### Patch Changes

- [#480](https://github.com/cloudflare/ai/pull/480) [`1c6bdad`](https://github.com/cloudflare/ai/commit/1c6bdade0f8ac07855876ddad96ab838435117bb) Thanks [@threepointone](https://github.com/threepointone)! - Add optional `fetch` parameter to credentials mode for request interception and testing. Available when using `accountId + apiKey` (not with bindings). Matches the pattern used by `@ai-sdk/openai` and `@ai-sdk/anthropic`.

## 3.1.9

### Patch Changes

- [#474](https://github.com/cloudflare/ai/pull/474) [`dc95a5f`](https://github.com/cloudflare/ai/commit/dc95a5fb65e472f610247d55bae0774914fe06ce) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

- [#461](https://github.com/cloudflare/ai/pull/461) [`9131bb4`](https://github.com/cloudflare/ai/commit/9131bb470663908632f2c86ef552dc9eae56194c) Thanks [@threepointone](https://github.com/threepointone)! - Replace tsup with tsdown as the build tool

## 3.1.8

### Patch Changes

- [#455](https://github.com/cloudflare/ai/pull/455) [`e02cdd2`](https://github.com/cloudflare/ai/commit/e02cdd20c841ffb564c568fcc9d5a000c2fb2615) Thanks [@ferdousbhai](https://github.com/ferdousbhai)! - fix(workers-ai-provider): close reasoning block before tool calls and text

## 3.1.7

### Patch Changes

- [#457](https://github.com/cloudflare/ai/pull/457) [`cc94a06`](https://github.com/cloudflare/ai/commit/cc94a06ca85603e473f41cc12ed83f53cbe9e136) Thanks [@threepointone](https://github.com/threepointone)! - Fix request cancellation by propagating `abortSignal` to outbound network calls.

  **ai-gateway-provider**: Pass `abortSignal` to the `fetch` call (API path) and to `binding.run()` (binding path) so that cancelled requests are properly aborted.

  **workers-ai-provider**: Pass `abortSignal` to `binding.run()` for chat, embedding, and image models, matching the existing behavior in transcription, speech, and reranking models.

  **@cloudflare/tanstack-ai**: Pass `signal` through to `binding.run()` in both `createGatewayFetch` (AI Gateway binding path) and `createWorkersAiBindingFetch` (Workers AI binding path).

## 3.1.6

### Patch Changes

- [#454](https://github.com/cloudflare/ai/pull/454) [`29087ad`](https://github.com/cloudflare/ai/commit/29087ad9ea9cb5398d03e0dfff13c24aa3759c61) Thanks [@mchenco](https://github.com/mchenco)! - Fix three tool calling bugs that caused multi-turn agentic loops to fail

  **1. Tool result output not unwrapped**

  `convert-to-workersai-chat-messages.ts` was calling `JSON.stringify(toolResponse.output)` on the entire `LanguageModelV3ToolResultOutput` wrapper object (`{ type: 'text', value: '...' }`), sending the wrapper as the tool message content instead of just the value. Models received garbled tool results and stopped after the first tool call instead of continuing.

  Fix: extract `output.value` and serialize only that.

  **2. `toolChoice: "required"` mapped to `"any"` instead of `"required"`**

  `utils.ts` mapped `toolChoice: "required"` to `tool_choice: "any"`. All vLLM-backed models (`@cf/moonshotai/kimi-k2.5`, `@cf/meta/llama-4-scout-17b-16e-instruct`, `@cf/zai-org/glm-4.7-flash`) return `8001: Invalid input` for `tool_choice: "any"`. The same incorrect mapping applied to `toolChoice: { type: "tool" }`.

  Fix: map both to `"required"`.

  **3. `description: false` in tool definitions**

  `utils.ts` used `&&` short-circuit for tool description and parameters, which evaluates to `false` (not `undefined`) when `tool.type !== "function"`. Sending `description: false` to the binding causes `8001: Invalid input`.

  Fix: use ternary to produce `undefined` when not applicable.

  Tested against `@cf/moonshotai/kimi-k2.5`, `@cf/meta/llama-4-scout-17b-16e-instruct`, and `@cf/zai-org/glm-4.7-flash` via the Workers AI binding.

## 3.1.5

### Patch Changes

- [#451](https://github.com/cloudflare/ai/pull/451) [`2a62e23`](https://github.com/cloudflare/ai/commit/2a62e23c7159df5ba69348f15da7a44eef73e83d) Thanks [@mchenco](https://github.com/mchenco)! - Fix reasoning content being concatenated into assistant message content in multi-turn conversations

  Previously, reasoning parts in assistant messages were concatenated into the `content` string when building message history. This caused models like `kimi-k2.5` and `deepseek-r1` to receive their own internal reasoning as if it were spoken text, corrupting the conversation history and resulting in empty text responses or leaked special tokens on subsequent turns.

  Reasoning parts are now sent as the `reasoning` field on the assistant message object, which is the field name vLLM expects on input for reasoning models (kimi-k2.5, glm-4.7-flash).

## 3.1.4

### Patch Changes

- [#448](https://github.com/cloudflare/ai/pull/448) [`054ccb8`](https://github.com/cloudflare/ai/commit/054ccb834ea3eb7a07d2b011e1ff1b8344f348fb) Thanks [@threepointone](https://github.com/threepointone)! - Fix image inputs for vision-capable chat models
  - Handle all `LanguageModelV3DataContent` variants (Uint8Array, base64 string, data URL) instead of only Uint8Array
  - Send images as OpenAI-compatible `image_url` content parts inline in messages, enabling vision for models like Llama 4 Scout and Kimi K2.5
  - Works with both the binding and REST API paths

## 3.1.3

### Patch Changes

- [#429](https://github.com/cloudflare/ai/pull/429) [`ae24f06`](https://github.com/cloudflare/ai/commit/ae24f06fc7d7c949b42be642886612e232956e8b) Thanks [@michaeldwan](https://github.com/michaeldwan)! - Pass tool_choice through to binding.run() so tool selection mode (auto, required, none) is respected when using Workers AI with the binding API

- [#410](https://github.com/cloudflare/ai/pull/410) [`bc2eba3`](https://github.com/cloudflare/ai/commit/bc2eba382613df420d698dc161d8914a745d71b0) Thanks [@vaibhavshn](https://github.com/vaibhavshn)! - fix: route REST API requests through AI Gateway when the `gateway` option is provided in `createRun()`

- [#446](https://github.com/cloudflare/ai/pull/446) [`3c35051`](https://github.com/cloudflare/ai/commit/3c35051ee9e405afff851224877c190c90071840) Thanks [@threepointone](https://github.com/threepointone)! - Remove tool_call_id sanitization that truncated IDs to 9 alphanumeric chars, which caused all tool call IDs to collide after round-trip

- [#444](https://github.com/cloudflare/ai/pull/444) [`b1c742b`](https://github.com/cloudflare/ai/commit/b1c742b461153ca113520fe7c1ef59cb44157e47) Thanks [@mchenco](https://github.com/mchenco)! - Add `sessionAffinity` setting to send `x-session-affinity` header for prefix-cache optimization. Also forward `extraHeaders` in the REST API path instead of discarding them.

## 3.1.2

### Patch Changes

- [#400](https://github.com/cloudflare/ai/pull/400) [`8822603`](https://github.com/cloudflare/ai/commit/882260300ccbf78a8c40e5ce54a49d02c7ad3c8c) Thanks [@threepointone](https://github.com/threepointone)! - Add early config validation to `createWorkersAI` that throws a clear error when neither a binding nor credentials (accountId + apiKey) are provided. Widen all model type parameters (TextGenerationModels, ImageGenerationModels, EmbeddingModels, TranscriptionModels, SpeechModels, RerankingModels) to accept arbitrary strings while preserving autocomplete for known models.

## 3.1.1

### Patch Changes

- [#396](https://github.com/cloudflare/ai/pull/396) [`2fb3ca8`](https://github.com/cloudflare/ai/commit/2fb3ca80542c8335fea83cac314fa52da772f38f) Thanks [@threepointone](https://github.com/threepointone)! - - Rewrite README with updated model recommendations (GPT-OSS 120B, EmbeddingGemma 300M, Aura-2 EN)
  - Stream tool calls incrementally using tool-input-start/delta/end events instead of buffering until stream end
  - Fix REST streaming for models that don't support it on /ai/run/ (GPT-OSS, Kimi) by retrying without streaming
  - Add Aura-2 EN/ES to SpeechModels type
  - Log malformed SSE events with console.warn instead of silently swallowing

## 3.1.0

### Minor Changes

- [#389](https://github.com/cloudflare/ai/pull/389) [`8538cd5`](https://github.com/cloudflare/ai/commit/8538cd53ce2e1be28cca95217725dfd4642fd7da) Thanks [@vaibhavshn](https://github.com/vaibhavshn)! - Add transcription, text-to-speech, and reranking support to the Workers AI provider.

  ### New capabilities

  - **Transcription** (`provider.transcription(model)`) — implements `TranscriptionModelV3`. Supports Whisper models (`@cf/openai/whisper`, `whisper-tiny-en`, `whisper-large-v3-turbo`) and Deepgram Nova-3 (`@cf/deepgram/nova-3`). Handles model-specific input formats: number arrays for basic Whisper, base64 for v3-turbo via REST, and `{ body, contentType }` for Nova-3 via binding or raw binary upload for Nova-3 via REST.

  - **Speech / TTS** (`provider.speech(model)`) — implements `SpeechModelV3`. Supports Workers AI TTS models including Deepgram Aura-1 (`@cf/deepgram/aura-1`). Accepts `text`, `voice`, and `speed` options. Returns audio as `Uint8Array`. Uses `returnRawResponse` to handle binary audio from the REST path without JSON parsing.

  - **Reranking** (`provider.reranking(model)`) — implements `RerankingModelV3`. Supports BGE reranker models (`@cf/baai/bge-reranker-base`, `bge-reranker-v2-m3`). Converts AI SDK's document format to Workers AI's `{ query, contexts, top_k }` input. Handles both text and JSON object documents.

  ### Bug fixes

  - **AbortSignal passthrough** — `createRun` REST shim now passes the abort signal to `fetch`, enabling request cancellation and timeout handling. Previously the signal was silently dropped.
  - **Nova-3 REST support** — Added `createRunBinary` utility for models that require raw binary upload instead of JSON (used by Nova-3 transcription via REST).

  ### Usage

  ```typescript
  import { createWorkersAI } from "workers-ai-provider";
  import {
    experimental_transcribe,
    experimental_generateSpeech,
    rerank,
  } from "ai";

  const workersai = createWorkersAI({ binding: env.AI });

  // Transcription
  const transcript = await experimental_transcribe({
    model: workersai.transcription("@cf/openai/whisper-large-v3-turbo"),
    audio: audioData,
    mediaType: "audio/wav",
  });

  // Speech
  const speech = await experimental_generateSpeech({
    model: workersai.speech("@cf/deepgram/aura-1"),
    text: "Hello world",
    voice: "asteria",
  });

  // Reranking
  const ranked = await rerank({
    model: workersai.reranking("@cf/baai/bge-reranker-base"),
    query: "What is machine learning?",
    documents: ["ML is a branch of AI.", "The weather is sunny."],
  });
  ```

## 3.0.5

### Patch Changes

- [#393](https://github.com/cloudflare/ai/pull/393) [`91b32e0`](https://github.com/cloudflare/ai/commit/91b32e0b0ef543fd198ddf387b9521ac3bd9650a) Thanks [@threepointone](https://github.com/threepointone)! - Comprehensive cleanup of the workers-ai-provider package.

  **Bug fixes:**

  - Fixed phantom dependency on `fetch-event-stream` that caused runtime crashes when installed outside the monorepo. Replaced with a built-in SSE parser.
  - Fixed streaming buffering: responses now stream token-by-token instead of arriving all at once. The root cause was twofold — an eager `ReadableStream` `start()` pattern that buffered all chunks, and a heuristic that silently fell back to non-streaming `doGenerate` whenever tools were defined. Both are fixed. Streaming now uses a proper `TransformStream` pipeline with backpressure.
  - Fixed `reasoning-delta` ID mismatch in simulated streaming — was using `generateId()` instead of the `reasoningId` from the preceding `reasoning-start` event, causing the AI SDK to drop reasoning content.
  - Fixed REST API client (`createRun`) silently swallowing HTTP errors. Non-200 responses now throw with status code and response body.
  - Fixed `response_format` being sent as `undefined` on every non-JSON request. Now only included when actually set.
  - Fixed `json_schema` field evaluating to `false` (a boolean) instead of `undefined` when schema was missing.

  **Workers AI quirk workarounds:**

  - Added `sanitizeToolCallId()` — strips non-alphanumeric characters and pads/truncates to 9 chars, fixing tool call round-trips through the binding which rejects its own generated IDs.
  - Added `normalizeMessagesForBinding()` — converts `content: null` to `""` and sanitizes tool call IDs before every binding call. Only applied on the binding path (REST preserves original IDs).
  - Added null-finalization chunk filtering for streaming tool calls.
  - Added numeric value coercion in native-format streams (Workers AI sometimes returns numbers instead of strings for the `response` field).
  - Improved image model to handle all output types from `binding.run()`: `ReadableStream`, `Uint8Array`, `ArrayBuffer`, `Response`, and `{ image: base64 }` objects.
  - Graceful degradation: if `binding.run()` returns a non-streaming response despite `stream: true`, it wraps the complete response as a simulated stream instead of throwing.

  **Premature stream termination detection:**

  - Streams that end without a `[DONE]` sentinel now report `finishReason: "error"` with `raw: "stream-truncated"` instead of silently reporting `"stop"`.
  - Stream read errors are caught and emit `finishReason: "error"` with `raw: "stream-error"`.

  **AI Search (formerly AutoRAG):**

  - Added `createAISearch` and `AISearchChatLanguageModel` as the canonical exports, reflecting the rename from AutoRAG to AI Search.
  - `createAutoRAG` still works but emits a one-time deprecation warning pointing to `createAISearch`.
  - `createAutoRAG` preserves `"autorag.chat"` as the provider name for backward compatibility.
  - AI Search now warns when tools or JSON response format are provided (unsupported by the `aiSearch` API).
  - Simplified AI Search internals — removed dead tool/response-format processing code.

  **Code quality:**

  - Removed dead code: `workersai-error.ts` (never imported), `workersai-image-config.ts` (inlined).
  - Consistent file naming: renamed `workers-ai-embedding-model.ts` to `workersai-embedding-model.ts`.
  - Replaced `StringLike` catch-all index signatures with `[key: string]: unknown` on settings types.
  - Replaced `any` types with proper interfaces (`FlatToolCall`, `OpenAIToolCall`, `PartialToolCall`).
  - Tightened `processToolCall` format detection to check `function.name` instead of just the presence of a `function` property.
  - Removed `@ai-sdk/provider-utils` and `zod` peer dependencies (no longer used in source).
  - Added `imageModel` to the `WorkersAI` interface type for consistency.

  **Tests:**

  - 149 unit tests across 10 test files (up from 82).
  - New test coverage: `sanitizeToolCallId`, `normalizeMessagesForBinding`, `prepareToolsAndToolChoice`, `processText`, `mapWorkersAIUsage`, image model output types, streaming error scenarios (malformed SSE, premature termination, empty stream), backpressure verification, graceful degradation (non-streaming fallback with text/tools/reasoning), REST API error handling (401/404/500), AI Search warnings, embedding `TooManyEmbeddingValuesForCallError`, message conversion with images and reasoning.
  - Integration tests for REST API and binding across 12 models and 7 categories (chat, streaming, multi-turn, tool calling, tool round-trip, structured output, image generation, embeddings).
  - All tests use the AI SDK's public APIs (`generateText`, `streamText`, `generateImage`, `embedMany`) instead of internal `.doGenerate()`/`.doStream()` methods.

  **README:**

  - Rewritten from scratch with concise examples, model recommendations, configuration guide, and known limitations section.
  - Updated to use current AI SDK v6 APIs (`generateText` + `Output.object` instead of deprecated `generateObject`, `generateImage` instead of `experimental_generateImage`, `stopWhen: stepCountIs(2)` instead of `maxSteps`).
  - Added sections for tool calling, structured output, embeddings, image generation, and AI Search.
  - Uses `wrangler.jsonc` format for configuration examples.

## 3.0.4

### Patch Changes

- [#390](https://github.com/cloudflare/ai/pull/390) [`41b92a3`](https://github.com/cloudflare/ai/commit/41b92a34ce4d9dffba8bb42b4933bbc06e4b1aaa) Thanks [@mchenco](https://github.com/mchenco)! - fix(workers-ai-provider): extract actual finish reason in streaming instead of hardcoded "stop"

  Previously, the streaming implementation always returned `finishReason: "stop"` regardless of the actual completion reason. This caused:

  - Tool calling scenarios to incorrectly report "stop" instead of "tool-calls"
  - Multi-turn tool conversations to fail because the AI SDK couldn't detect when tools were requested
  - Length limit scenarios to show "stop" instead of "length"
  - Error scenarios to show "stop" instead of "error"

  The fix extracts the actual `finish_reason` from streaming chunks and uses the existing `mapWorkersAIFinishReason()` function to properly map it to the AI SDK's finish reason format. This enables proper multi-turn tool calling and accurate completion status reporting.

## 3.0.3

### Patch Changes

- [#384](https://github.com/cloudflare/ai/pull/384) [`0947ea2`](https://github.com/cloudflare/ai/commit/0947ea224400b17af7cc12854c7a0ec6cb6f5d3e) Thanks [@mchenco](https://github.com/mchenco)! - fix(workers-ai-provider): preserve tool call IDs in conversation history

## 3.0.2

### Patch Changes

- [`e5b0138`](https://github.com/cloudflare/ai/commit/e5b01383c09690e8cb13b3fcc0f8abdeab237147) Thanks [@threepointone](https://github.com/threepointone)! - update deps

## 3.0.1

### Patch Changes

- [#315](https://github.com/cloudflare/ai/pull/315) [`5ee3b4d`](https://github.com/cloudflare/ai/commit/5ee3b4dbec94ed2493c872b4ab93b392c23a04a2) Thanks [@agcty](https://github.com/agcty)! - move deps to peer deps

## 3.0.0

### Major Changes

- [#338](https://github.com/cloudflare/ai/pull/338) [`cd9e93c`](https://github.com/cloudflare/ai/commit/cd9e93cc7f124dfc1f4c89dfb58e8b69fc94f197) Thanks [@threepointone](https://github.com/threepointone)! - migrate to ai sdk v6

## 2.0.2

### Patch Changes

- [#339](https://github.com/cloudflare/ai/pull/339) [`ea16584`](https://github.com/cloudflare/ai/commit/ea16584319bacb906629109eeb0c3eeee8976f75) Thanks [@threepointone](https://github.com/threepointone)! - remove blank tags array

## 2.0.1

### Patch Changes

- [#336](https://github.com/cloudflare/ai/pull/336) [`23aa670`](https://github.com/cloudflare/ai/commit/23aa6704e0c66be9ea5b93ba98ec903b38cf7e93) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 2.0.0

### Major Changes

- [#256](https://github.com/cloudflare/ai/pull/256) [`a538901`](https://github.com/cloudflare/ai/commit/a5389013b9a512707fb1de1501a1547fce20c014) Thanks [@jahands](https://github.com/jahands)! - feat: Migrate to AI SDK v5

  This updates workers-ai-provider and ai-gateway-provider to use the AI SDK v5. Please refer to the official migration guide to migrate your code https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0

### Patch Changes

- [#216](https://github.com/cloudflare/ai/pull/216) [`26e5fdb`](https://github.com/cloudflare/ai/commit/26e5fdb7186afa911fc98faaf62c1e413db619dd) Thanks [@wussh](https://github.com/wussh)! - Improve documentation by adding generateText example to workers-ai-provider and clarifying supported methods in ai-gateway-provider.

## 0.7.5

### Patch Changes

- [#263](https://github.com/cloudflare/ai/pull/263) [`7b2745a`](https://github.com/cloudflare/ai/commit/7b2745a9d6e6742308a342c2f1b57c6597c24779) Thanks [@byule](https://github.com/byule)! - fix: use correct fieldname and format for tool_call ids

## 0.7.4

### Patch Changes

- [#261](https://github.com/cloudflare/ai/pull/261) [`50fad0f`](https://github.com/cloudflare/ai/commit/50fad0f41431b4db469c1d500e116386c82c0500) Thanks [@threepointone](https://github.com/threepointone)! - fix: pass a tool call id and read it back out for tool calls

## 0.7.3

### Patch Changes

- [#258](https://github.com/cloudflare/ai/pull/258) [`b1ee224`](https://github.com/cloudflare/ai/commit/b1ee22414e30533082bdfebf1f89a3c828ca5b6d) Thanks [@threepointone](https://github.com/threepointone)! - fix: don't crash if a model response has only tool calls

## 0.7.2

### Patch Changes

- [#233](https://github.com/cloudflare/ai/pull/233) [`836bc3d`](https://github.com/cloudflare/ai/commit/836bc3d83b1347a09c83c6876f72410e1487583c) Thanks [@JoaquinGimenez1](https://github.com/JoaquinGimenez1)! - Process Text from response content

## 0.7.1

### Patch Changes

- [#231](https://github.com/cloudflare/ai/pull/231) [`143a384`](https://github.com/cloudflare/ai/commit/143a384281f9aa601091c924030e7508424777cf) Thanks [@JoaquinGimenez1](https://github.com/JoaquinGimenez1)! - Adds support for getting delta content

## 0.7.0

### Minor Changes

- [#205](https://github.com/cloudflare/ai/pull/205) [`804804b`](https://github.com/cloudflare/ai/commit/804804b721f9201f16e3617ade91e255949a4ca6) Thanks [@JoaquinGimenez1](https://github.com/JoaquinGimenez1)! - Adds support for Chat Completions API responses

## 0.6.5

### Patch Changes

- [`414f85c`](https://github.com/cloudflare/ai/commit/414f85ca69c3fa4ba7b98e72a23d4e3042c67d2b) Thanks [@threepointone](https://github.com/threepointone)! - Trigger a release

## 0.6.4

### Patch Changes

- [#208](https://github.com/cloudflare/ai/pull/208) [`a08f7d4`](https://github.com/cloudflare/ai/commit/a08f7d41f77aa527eeb966dde97e963150d3038e) Thanks [@G4brym](https://github.com/G4brym)! - Remove @Deprecated flag on gateway option

## 0.6.3

### Patch Changes

- [#206](https://github.com/cloudflare/ai/pull/206) [`f7aa30d`](https://github.com/cloudflare/ai/commit/f7aa30d9ee61fdc0330ea62c206a7ff3a3f64401) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 0.6.2

### Patch Changes

- [#197](https://github.com/cloudflare/ai/pull/197) [`6506faa`](https://github.com/cloudflare/ai/commit/6506faacd50f066e86f6cd9c0eae297afc523bca) Thanks [@JoaquinGimenez1](https://github.com/JoaquinGimenez1)! - Add rawResponse from Workers AI

## 0.6.1

### Patch Changes

- [`c9d5636`](https://github.com/cloudflare/ai/commit/c9d56364bd774ef657c1b6e42817ee220bba8ae0) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 0.6.0

### Minor Changes

- [#181](https://github.com/cloudflare/ai/pull/181) [`9f5562a`](https://github.com/cloudflare/ai/commit/9f5562a16e645195d911134610871059eceb9b3e) Thanks [@JoaquinGimenez1](https://github.com/JoaquinGimenez1)! - Adds support for new tool call format during streaming

## 0.5.3

### Patch Changes

- [`de992e6`](https://github.com/cloudflare/ai/commit/de992e6e9b7245c9aba5c64c50e6d5df8820b4ba) Thanks [@threepointone](https://github.com/threepointone)! - trigger a release for reverted change

## 0.5.2

### Patch Changes

- [#170](https://github.com/cloudflare/ai/pull/170) [`4f57e61`](https://github.com/cloudflare/ai/commit/4f57e61223c532df128b6bd454d2bd01205917b7) Thanks [@JoaquinGimenez1](https://github.com/JoaquinGimenez1)! - Support new tool call format on streaming responses

## 0.5.1

### Patch Changes

- [`7cc3626`](https://github.com/cloudflare/ai/commit/7cc362689fc632d1c266796b13272bc9a643007c) Thanks [@threepointone](https://github.com/threepointone)! - trigger a release to pick up new deps

## 0.5.0

### Minor Changes

- [#163](https://github.com/cloudflare/ai/pull/163) [`6b25ed7`](https://github.com/cloudflare/ai/commit/6b25ed701252346d135135aca40e53157a27bdf3) Thanks [@andyjessop](https://github.com/andyjessop)! - feat: adds support for embed and embedMany

## 0.4.1

### Patch Changes

- [`ac0693d`](https://github.com/cloudflare/ai/commit/ac0693d75b0c481935cdd48417e69db66083efe6) Thanks [@threepointone](https://github.com/threepointone)! - For #126; thanks @jokull for adding AutoRAG support to workers-ai-provider

## 0.4.0

### Minor Changes

- [#153](https://github.com/cloudflare/ai/pull/153) [`ae5ac12`](https://github.com/cloudflare/ai/commit/ae5ac12cd4f1b17792af29e05cccc0c9403f38d9) Thanks [@JoaquinGimenez1](https://github.com/JoaquinGimenez1)! - Add support for new tool call format

## 0.3.2

### Patch Changes

- [`3ba9ac5`](https://github.com/cloudflare/ai/commit/3ba9ac5f1594d71dbedda8fec469084510afea43) Thanks [@threepointone](https://github.com/threepointone)! - Update dependencies

## 0.3.1

### Patch Changes

- [#137](https://github.com/cloudflare/ai/pull/137) [`cb2cc87`](https://github.com/cloudflare/ai/commit/cb2cc871566c4dbe8a09711ee86944ddcdb15bc6) Thanks [@mchenco](https://github.com/mchenco)! - adding vision support (For Llama 3.2 11b vision right now)

## 0.3.0

### Minor Changes

- [#72](https://github.com/cloudflare/ai/pull/72) [`9b8dfc1`](https://github.com/cloudflare/ai/commit/9b8dfc1adc94079728634994d6afe81028ea11d8) Thanks [@andyjessop](https://github.com/andyjessop)! - feat: allow passthrough options as model settings

## 0.2.2

### Patch Changes

- [#65](https://github.com/cloudflare/ai/pull/65) [`b17cf52`](https://github.com/cloudflare/ai/commit/b17cf52757e51eb30da25370319daf8efc43791e) Thanks [@andyjessop](https://github.com/andyjessop)! - fix: gracefully handles streaming chunk without response property

## 0.2.1

### Patch Changes

- [#47](https://github.com/cloudflare/ai/pull/47) [`e000b7c`](https://github.com/cloudflare/ai/commit/e000b7c1c4a03f50810154854a001fa5500d8591) Thanks [@andyjessop](https://github.com/andyjessop)! - chore: implement generateImage function

## 0.2.0

### Minor Changes

- [#41](https://github.com/cloudflare/workers-ai-provider/pull/41) [`5bffa40`](https://github.com/cloudflare/workers-ai-provider/commit/5bffa404bfa2f70487d1c663481201b6b202351c) Thanks [@andyjessop](https://github.com/andyjessop)! - feat: adds the ability to use the provider outside of the workerd environment by providing Cloudflare accountId/apiKey credentials.

## 0.1.3

### Patch Changes

- [#39](https://github.com/cloudflare/workers-ai-provider/pull/39) [`9add2b5`](https://github.com/cloudflare/workers-ai-provider/commit/9add2b5c75e0c96e9ba936717a5fc399962f0f01) Thanks [@andyjessop](https://github.com/andyjessop)! - Trigger release for recent bug fixes

## 0.1.2

### Patch Changes

- [#35](https://github.com/cloudflare/workers-ai-provider/pull/35) [`9e74cc9`](https://github.com/cloudflare/workers-ai-provider/commit/9e74cc9ac939d77602d5a9873e717d9cd52e734f) Thanks [@andyjessop](https://github.com/andyjessop)! - Ensures that tool call data is available to model, by providing the JSON of the tool call as the content in the assistant message.

## 0.1.1

### Patch Changes

- [#32](https://github.com/cloudflare/workers-ai-provider/pull/32) [`9ffc5b8`](https://github.com/cloudflare/workers-ai-provider/commit/9ffc5b8640495440d0237ca3a201aaef1c7f441a) Thanks [@andyjessop](https://github.com/andyjessop)! - Fixes structured outputs

## 0.1.0

### Minor Changes

- [#29](https://github.com/cloudflare/workers-ai-provider/pull/29) [`762b37b`](https://github.com/cloudflare/workers-ai-provider/commit/762b37b05aee1ab61838923ad1100d2db7aa4569) Thanks [@threepointone](https://github.com/threepointone)! - trigger a minor release

## 0.0.13

### Patch Changes

- [#27](https://github.com/cloudflare/workers-ai-provider/pull/27) [`add4120`](https://github.com/cloudflare/workers-ai-provider/commit/add4120ce09714d86917cfa891fb3072cdcbcd00) Thanks [@jiang-zhexin](https://github.com/jiang-zhexin)! - Exclude BaseAiTextToImage model

- [#23](https://github.com/cloudflare/workers-ai-provider/pull/23) [`b15ad06`](https://github.com/cloudflare/workers-ai-provider/commit/b15ad067516ea3504679f8613f9893778e61dfa7) Thanks [@andyjessop](https://github.com/andyjessop)! - Fix streaming output by ensuring that events is only called once per stream

- [#26](https://github.com/cloudflare/workers-ai-provider/pull/26) [`6868be7`](https://github.com/cloudflare/workers-ai-provider/commit/6868be7fc22f4c122c49043445c61eec9f41cfcc) Thanks [@andyjessop](https://github.com/andyjessop)! - configures AI Gateway to work with streamText

## 0.0.12

### Patch Changes

- [#21](https://github.com/cloudflare/workers-ai-provider/pull/21) [`6e71dd2`](https://github.com/cloudflare/workers-ai-provider/commit/6e71dd2ec07f573fac2700a195a8dcffc6a85495) Thanks [@andyjessop](https://github.com/andyjessop)! - Fixes tool calling for generateText

## 0.0.11

### Patch Changes

- [`eddaf37`](https://github.com/cloudflare/workers-ai-provider/commit/eddaf37bbe6c0c06b213a885d7ce2c35989cc564) Thanks [@threepointone](https://github.com/threepointone)! - update dependencies

## 0.0.10

### Patch Changes

- [`d16ae4c`](https://github.com/threepointone/workers-ai-provider/commit/d16ae4caa8bc027604006e05faba9ca8ab4bb09d) Thanks [@threepointone](https://github.com/threepointone)! - update readme

## 0.0.9

### Patch Changes

- [`deacf87`](https://github.com/threepointone/workers-ai-provider/commit/deacf87e184c8e358b29036e48b84e0a7fecc607) Thanks [@threepointone](https://github.com/threepointone)! - fix some types and buffering

## 0.0.8

### Patch Changes

- [`bc6408c`](https://github.com/threepointone/workers-ai-provider/commit/bc6408c907400d9a30532f69cfc9c2bcae4aa930) Thanks [@threepointone](https://github.com/threepointone)! - try another release

## 0.0.7

### Patch Changes

- [`2a470cb`](https://github.com/threepointone/workers-ai-provider/commit/2a470cb49e931efc228bca046fa1247682a49666) Thanks [@threepointone](https://github.com/threepointone)! - publish

## 0.0.6

### Patch Changes

- [`30e7ead`](https://github.com/threepointone/workers-ai-provider/commit/30e7eadef9ec2b6b3d1e6fa1ed9de7e852496397) Thanks [@threepointone](https://github.com/threepointone)! - try to trigger a build

## 0.0.5

### Patch Changes

- [`4e967af`](https://github.com/threepointone/workers-ai-provider/commit/4e967af7a840933983120e03fd3163b15f96c48c) Thanks [@threepointone](https://github.com/threepointone)! - fix readme, stray console log

## 0.0.4

### Patch Changes

- [`66e48bc`](https://github.com/threepointone/workers-ai-provider/commit/66e48bc0bd4765eb056bba9cf94197f911697ab8) Thanks [@threepointone](https://github.com/threepointone)! - 🫧

- [`3e15260`](https://github.com/threepointone/workers-ai-provider/commit/3e15260e4fe0e6d5b06c1f5fa2dd86a668921ba8) Thanks [@threepointone](https://github.com/threepointone)! - fix example

## 0.0.3

### Patch Changes

- [`294c9a9`](https://github.com/threepointone/workers-ai-provider/commit/294c9a9ca48654c0b3ee7686ef19cc5f6f41f0cb) Thanks [@threepointone](https://github.com/threepointone)! - try to do a release
