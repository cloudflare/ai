# @cloudflare/tanstack-ai

Workers AI and AI Gateway adapters for [TanStack AI](https://tanstack.com/ai).
Chat, image, transcription, TTS, and summarization on Workers AI, plus gateway
routing for OpenAI, Anthropic, Gemini, Grok, and OpenRouter — plus
**resumable streaming** on the Workers AI catalog run path _(coming soon)_.

- Package README (quickstart): [`packages/tanstack-ai`](../../packages/tanstack-ai/README.md)
- Concepts: [gateway routing](../concepts/gateway-routing.md) ·
  [resume](../concepts/resume.md) _(coming soon)_ · [binding vs REST](../concepts/binding-vs-rest.md)

## Workers AI chat adapter

```ts
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";
import { chat, toHttpResponse } from "@tanstack/ai";

const adapter = createWorkersAiChat("@cf/zai-org/glm-5.2", { binding: env.AI });

const response = chat({
	adapter,
	stream: true,
	messages: [{ role: "user", content: "Write a haiku about Cloudflare." }],
});

return toHttpResponse(response);
```

Configure with a `binding` (in a Worker) or `accountId` + `apiKey` (REST):

```ts
const adapter = createWorkersAiChat("@cf/zai-org/glm-5.2", {
	accountId: "your-account-id",
	apiKey: "your-api-key",
});
```

The adapter internally uses the OpenAI SDK and transforms Workers AI's native SSE
stream to OpenAI-compatible SSE. Both transports are auto-detected from the config
you pass, so the rest of your code is identical.

### Reasoning controls

Reasoning-capable models (GLM, Kimi, GPT-OSS, QwQ) accept `reasoning_effort` and
`chat_template_kwargs` per call via `modelOptions`:

```ts
chat({
	adapter,
	stream: true,
	messages: [{ role: "user", content: "Summarize this." }],
	modelOptions: {
		reasoning_effort: "low", // "low" | "medium" | "high" | null (null disables)
		chat_template_kwargs: { enable_thinking: false },
	},
});
```

### Resumable streaming

> **🚧 Coming soon.** Resumable streaming is not generally available yet — the
> AI Gateway resume backend is still rolling out. The `resume` /
> `onResumeExpired` options below are in place so you can adopt them early, but
> treat resume as experimental until the rollout completes.

The Workers AI adapter dispatches **catalog** models through the AI Gateway run
path, so streams are resumable when a `cf-aig-run-id` is available:

```ts
const adapter = createWorkersAiChat("openai/gpt-5", {
	binding: env.AI,
	gateway: "my-gateway",
	resume: true, // default; transparently reconnects mid-stream drops
	onResumeExpired: "accept-partial", // or "error" (default)
});
```

Resume requires the **binding** and a run id. With REST, a gateway-binding-only
config, or where no run id is emitted, resume is a no-op plus a warning — never a
hard failure. See [resume](../concepts/resume.md).

## Other Workers AI modalities

Image, transcription, text-to-speech, and summarization each have their own
adapter factory + TanStack AI activity function. All accept the same `binding` /
`accountId`+`apiKey` config as the chat adapter.

```ts
import {
	createWorkersAiImage,
	createWorkersAiTranscription,
	createWorkersAiTts,
	createWorkersAiSummarize,
} from "@cloudflare/tanstack-ai";
import { generateImage, generateTranscription, generateSpeech, summarize } from "@tanstack/ai";

// Image generation
const image = await generateImage({
	adapter: createWorkersAiImage("@cf/black-forest-labs/flux-1-schnell", { binding: env.AI }),
	prompt: "a cat in space",
});
// image.images[0].b64Json

// Transcription (speech-to-text)
const t = await generateTranscription({
	adapter: createWorkersAiTranscription("@cf/openai/whisper-large-v3-turbo", { binding: env.AI }),
	audio: audioArrayBuffer,
});
// t.text, t.segments

// Text-to-speech
const tts = await generateSpeech({
	adapter: createWorkersAiTts("@cf/deepgram/aura-2-en", { binding: env.AI }),
	text: "Hello world",
});
// tts.audio (base64)

// Summarization (native BART-large-CNN)
const s = await summarize({
	adapter: createWorkersAiSummarize("@cf/facebook/bart-large-cnn", { binding: env.AI }),
	text: "Long article here...",
});
// s.summary
```

> The image adapter accepts TanStack AI's multimodal `MediaPrompt`
> (`string | MediaPromptPart[]`) but flattens it to text — Workers AI
> text-to-image models take a text prompt only; non-text parts are dropped.

## Gateway adapters (third-party providers)

Route OpenAI / Anthropic / Gemini / Grok / OpenRouter through your gateway with a
per-provider chat factory. Use the `env.AI.gateway(id)` binding in a Worker, or
REST credentials anywhere:

```ts
import { createOpenAiChat, createAnthropicChat } from "@cloudflare/tanstack-ai";
import { chat } from "@tanstack/ai";

// Binding (recommended in a Worker)
const openai = createOpenAiChat("gpt-5", { binding: env.AI.gateway("my-gateway") });

// REST credentials (anywhere)
const anthropic = createAnthropicChat("claude-sonnet-4-5", {
	accountId: env.CF_ACCOUNT_ID,
	gatewayId: "my-gateway",
	cfApiKey: env.CF_AIG_TOKEN, // only if the gateway is authenticated
	apiKey: env.ANTHROPIC_API_KEY, // provider key, unless using unified billing / BYOK
});

const response = chat({
	adapter: openai,
	stream: true,
	messages: [{ role: "user", content: "Hi" }],
});
```

Cache/log controls (`cacheTtl`, `skipCache`, `customCacheKey`, `metadata`,
`collectLog`) build the standard `cf-aig-*` headers:

```ts
const adapter = createOpenAiChat("gpt-5", {
	binding: env.AI.gateway("my-gateway"),
	cacheTtl: 3600,
	metadata: { user: "123" },
});
```

`byokAlias` (`cf-aig-byok-alias`) is credentials / REST only — including
Gemini (`createGeminiChat` via `httpOptions.headers`). The AI binding does
not select a non-`default` stored key for third-party models:

```ts
const adapter = createOpenAiChat("gpt-5", {
	accountId: env.CF_ACCOUNT_ID,
	gatewayId: "my-gateway",
	cfApiKey: env.CF_AIG_TOKEN,
	byokAlias: "development",
});
```

See the [package README](../../packages/tanstack-ai/README.md) for the full list
of provider factories (chat / summarize / image / transcription / TTS / video)
and the four Workers AI configuration modes.

## Forced tool-call salvage (#560)

Some gpt-oss / harmony-style models leak forced tool calls as JSON text instead
of structured `tool_calls`. When a tool was forced (`tool_choice: "required"` or
a named function), the adapter salvages those leaked calls — recovering only JSON
objects whose `name` matches a requested tool, so prose and channel/role leaks
are ignored. The `workers-ai-provider` delegate applies the same salvage logic.
