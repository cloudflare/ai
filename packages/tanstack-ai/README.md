# @cloudflare/tanstack-ai

Use [TanStack AI](https://tanstack.com/ai) with Cloudflare Workers AI and AI Gateway. Supports chat, image generation, transcription, text-to-speech, and summarization with Workers AI models, plus routing through AI Gateway for OpenAI, Anthropic, Gemini, Grok, and OpenRouter.

## Features

- **Workers AI**: Chat, image generation, transcription (Whisper + Deepgram), TTS, and summarization via `env.AI` binding or REST API
- **AI Gateway**: Route requests to OpenAI, Anthropic, Gemini, Grok, OpenRouter, and Workers AI through Cloudflare's AI Gateway for caching, rate limiting, and unified billing
- **Flexible Configuration**: Four config modes — plain binding, plain REST, gateway binding, gateway REST
- **Type-Safe**: Full TypeScript support with model-specific types and type inference

## Installation

```bash
npm install @cloudflare/tanstack-ai @tanstack/ai
```

For AI Gateway with third-party providers, install the provider SDKs you need:

```bash
# For OpenAI
npm install @tanstack/ai-openai

# For Anthropic
npm install @tanstack/ai-anthropic

# For Gemini
npm install @tanstack/ai-gemini

# For Grok
npm install @tanstack/ai-grok

# For OpenRouter
npm install @tanstack/ai-openrouter @openrouter/sdk
```

## Workers AI

The simplest way to use AI in a Cloudflare Worker. No API keys needed for Workers AI models when using a binding.

### Chat

**Using the binding (recommended):**

```typescript
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";
import { chat, toHttpResponse } from "@tanstack/ai";

const adapter = createWorkersAiChat("@cf/meta/llama-4-scout-17b-16e-instruct", {
	binding: env.AI,
});

const response = chat({
	adapter,
	stream: true,
	messages: [{ role: "user", content: "Hello!" }],
});

return toHttpResponse(response);
```

**Using REST credentials:**

```typescript
const adapter = createWorkersAiChat("@cf/meta/llama-4-scout-17b-16e-instruct", {
	accountId: "your-account-id",
	apiKey: "your-api-key",
});
```

### Vision (Image Inputs)

Send images to vision-capable chat models:

```typescript
const adapter = createWorkersAiChat("@cf/meta/llama-4-scout-17b-16e-instruct", {
	accountId: "your-account-id",
	apiKey: "your-api-key",
});

const response = chat({
	adapter,
	stream: true,
	messages: [
		{
			role: "user",
			content: [
				{ type: "text", content: "What's in this image?" },
				{
					type: "image",
					source: { type: "data", value: base64String, mimeType: "image/png" },
				},
			],
		},
	],
});
```

URL sources are also supported:

```typescript
{ type: "image", source: { type: "url", value: "https://example.com/photo.jpg" } }
```

Works with all configuration modes (binding, REST, and AI Gateway).

### Image Generation

```typescript
import { createWorkersAiImage } from "@cloudflare/tanstack-ai";
import { generateImage } from "@tanstack/ai";

const adapter = createWorkersAiImage("@cf/stabilityai/stable-diffusion-xl-base-1.0", {
	binding: env.AI,
});

const result = await generateImage({ adapter, prompt: "a cat in space" });
// result.images[0].b64Json — base64-encoded image
```

### Transcription (Speech-to-Text)

```typescript
import { createWorkersAiTranscription } from "@cloudflare/tanstack-ai";
import { generateTranscription } from "@tanstack/ai";

const adapter = createWorkersAiTranscription("@cf/openai/whisper-large-v3-turbo", {
	binding: env.AI,
});

const result = await generateTranscription({ adapter, audio: audioArrayBuffer });
// result.text — the transcribed text
// result.segments — timed segments (whisper-large-v3-turbo)
```

Supported models: `@cf/openai/whisper`, `@cf/openai/whisper-tiny-en`, `@cf/openai/whisper-large-v3-turbo`, `@cf/deepgram/nova-3`

### Text-to-Speech

```typescript
import { createWorkersAiTts } from "@cloudflare/tanstack-ai";
import { generateSpeech } from "@tanstack/ai";

const adapter = createWorkersAiTts("@cf/deepgram/aura-2-en", {
	binding: env.AI,
});

const result = await generateSpeech({ adapter, text: "Hello world" });
// result.audio — base64-encoded audio
```

### Summarization

```typescript
import { createWorkersAiSummarize } from "@cloudflare/tanstack-ai";
import { summarize } from "@tanstack/ai";

const adapter = createWorkersAiSummarize("@cf/facebook/bart-large-cnn", {
	binding: env.AI,
});

const result = await summarize({ adapter, text: "Long article here..." });
// result.summary
```

> **Coming soon:** Workers AI embedding adapter is implemented internally but waiting on TanStack AI to add `embed()` / `embedMany()` activity functions and a `BaseEmbeddingAdapter` base class.

## AI Gateway

Route AI requests through Cloudflare's AI Gateway for caching, rate limiting, and unified billing. Supports Workers AI and third-party providers.

### Configuration

**Using AI Binding (Recommended for Cloudflare Workers):**

```typescript
const adapter = createOpenAiChat("gpt-4o", {
	binding: env.AI.gateway("my-gateway-id"),
});
```

**Using Credentials:**

```typescript
const adapter = createOpenAiChat("gpt-4o", {
	accountId: "your-account-id",
	gatewayId: "your-gateway-id",
	cfApiKey: "your-cf-api-key", // Optional: if gateway is authenticated
	apiKey: "provider-api-key", // Optional: provider API key if not using Unified Billing or BYOK
});
```

**Cache options (binding and credentials):**

```typescript
const adapter = createOpenAiChat("gpt-4o", {
	binding: env.AI.gateway("my-gateway-id"),
	skipCache: false,
	cacheTtl: 3600,
	customCacheKey: "my-key",
	metadata: { user: "test" },
});
```

### Workers AI through Gateway

```typescript
const adapter = createWorkersAiChat("@cf/meta/llama-4-scout-17b-16e-instruct", {
	binding: env.AI.gateway("my-gateway-id"),
	apiKey: env.WORKERS_AI_TOKEN,
});
```

### Third-Party Providers through Gateway

```typescript
import {
	createOpenAiChat,
	createAnthropicChat,
	createGeminiChat,
	createGrokChat,
	createOpenRouterChat,
} from "@cloudflare/tanstack-ai";

// OpenAI
const openai = createOpenAiChat("gpt-4o", config);

// Anthropic
const anthropic = createAnthropicChat("claude-sonnet-4-5", config);

// Gemini (credentials only)
const gemini = createGeminiChat("gemini-2.0-flash", {
	accountId: env.CF_ACCOUNT_ID,
	gatewayId: env.CF_AIG_ID,
	cfApiKey: env.CF_AIG_TOKEN,
});

// Grok
const grok = createGrokChat("grok-4", config);

// OpenRouter (access any model via OpenRouter)
const openrouter = createOpenRouterChat("openai/gpt-4o", config);
```

## Supported Capabilities

| Provider       | Chat | Summarize | Image Gen | Transcription | TTS | Video |
| -------------- | ---- | --------- | --------- | ------------- | --- | ----- |
| **Workers AI** | ✅   | ✅        | ✅        | ✅            | ✅  | ❌    |
| **OpenAI**     | ✅   | ✅        | ✅        | ✅            | ✅  | ✅    |
| **Gemini**     | ✅   | ✅        | ✅        | ❌            | ✅  | ❌    |
| **Anthropic**  | ✅   | ✅        | ❌        | ❌            | ❌  | ❌    |
| **Grok**       | ✅   | ✅        | ✅        | ❌            | ❌  | ❌    |
| **OpenRouter** | ✅   | ✅        | ✅        | ❌            | ❌  | ❌    |

### All Functions

**Workers AI:**

- `createWorkersAiChat(model, config)` -- chat and structured output
- `createWorkersAiImage(model, config)` -- image generation
- `createWorkersAiTranscription(model, config)` -- speech-to-text (Whisper, Deepgram nova-3)
- `createWorkersAiTts(model, config)` -- text-to-speech (Deepgram Aura-2, Aura-1)
- `createWorkersAiSummarize(model, config)` -- summarization (BART-large-CNN)

**OpenAI:**

- `createOpenAiChat(model, config)`
- `createOpenAiSummarize(model, config)`
- `createOpenAiImage(model, config)`
- `createOpenAiTranscription(model, config)`
- `createOpenAiTts(model, config)`
- `createOpenAiVideo(model, config)`

**Anthropic:**

- `createAnthropicChat(model, config)`
- `createAnthropicSummarize(model, config)`

**Gemini:**

- `createGeminiChat(model, config)` -- credentials only, no binding support
- `createGeminiSummarize(model, config)` -- credentials only, no binding support
- `createGeminiImage(model, config)` -- credentials only, no binding support
- `createGeminiTts(model, config)` -- text-to-speech (experimental), credentials only

> **Note:** Gemini adapters use the Google GenAI SDK's `httpOptions.baseUrl` and `httpOptions.headers` to route through the gateway, rather than the custom fetch approach used by other providers. Binding config is not supported — only credentials. See [googleapis/js-genai#999](https://github.com/googleapis/js-genai/issues/999) for the upstream issue tracking custom `fetch` support.

**Grok:**

- `createGrokChat(model, config)`
- `createGrokSummarize(model, config)`
- `createGrokImage(model, config)`

**OpenRouter:**

- `createOpenRouterChat(model, config)` -- access any model via OpenRouter
- `createOpenRouterSummarize(model, config)`
- `createOpenRouterImage(model, config)`

## Workers AI Configuration Modes

Workers AI supports four configuration modes:

| Mode            | Config                            | Description                    |
| --------------- | --------------------------------- | ------------------------------ |
| Plain binding   | `{ binding: env.AI }`             | Direct access, no gateway      |
| Plain REST      | `{ accountId, apiKey }`           | REST API, no gateway           |
| Gateway binding | `{ binding: env.AI.gateway(id) }` | Through AI Gateway via binding |
| Gateway REST    | `{ accountId, gatewayId, ... }`   | Through AI Gateway via REST    |

Third-party providers (OpenAI, Anthropic, Gemini, Grok, OpenRouter) only support the gateway modes.

All Workers AI config modes also accept `sessionAffinity` to route requests with the same key to the same backend replica for prefix-cache optimization:

```typescript
const adapter = createWorkersAiChat("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
	binding: env.AI,
	sessionAffinity: "my-unique-session-id",
});
```

## Links

- [TanStack AI Documentation](https://tanstack.com/ai)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
