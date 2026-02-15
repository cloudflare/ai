# workers-ai-provider

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
