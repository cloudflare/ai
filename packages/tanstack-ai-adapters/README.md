# Cloudflare AI Gateway Adapters for TanStack AI

Cloudflare AI Gateway adapters for [TanStack AI](https://tanstack.com/ai), enabling seamless integration with OpenAI, Anthropic, Gemini, and Grok through Cloudflare's AI Gateway.

## Features

- **Multiple Providers**: Support for OpenAI, Anthropic, Gemini, and Grok
- **Flexible Configuration**: Use Cloudflare Workers AI binding or credentials-based configuration
- **Type-Safe**: Full TypeScript support with type inference
- **Modular**: Import only the adapters you need

## Installation

```bash
npm install @cloudflare/tanstack-ai @tanstack/ai
```

Install the provider SDKs you need:

```bash
# For OpenAI
npm install @tanstack/ai-openai

# For Anthropic
npm install @tanstack/ai-anthropic

# For Gemini
npm install @tanstack/ai-gemini

# For Grok
npm install @tanstack/ai-grok
```

## Quick Start

### Basic Chat Example

```typescript
import { env } from "cloudflare:workers";
import { createOpenAiChat } from "@cloudflare/tanstack-ai";
import { chat } from "@tanstack/ai";

const adapter = createOpenAiChat("gpt-4o", {
  binding: env.AI.gateway(env.CF_AIG_ID),
});

const response = await chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Configuration Options

**Using AI Binding (Recommended for Cloudflare Workers):**

```typescript
const adapter = createOpenAiChat("gpt-4o", {
  binding: env.AI.gateway(env.CF_AIG_ID),
});
```

**Using Credentials:**

```typescript
const adapter = createOpenAiChat{
  accountId: "your-account-id",
  gatewayId: "your-gateway-id",
  cfApiKey: "your-cf-api-key", // Optional: if gateway is authenticated
  apiKey: "provider-api-key", // Optional: provider API key if not using Unified Billing or BYOK
});
```

## Supported Capabilities

| Provider      | Chat | Summarize | Image Generation | Transcription | Text-to-Speech | Video |
| ------------- | ---- | --------- | ---------------- | ------------- | -------------- | ----- |
| **OpenAI**    | ✅   | ✅        | ✅               | ✅            | ✅             | ✅    |
| **Gemini**    | ✅   | ✅        | ✅               | ❌            | ❌             | ❌    |
| **Anthropic** | ✅   | ✅        | ❌               | ❌            | ❌             | ❌    |
| **Grok**      | ✅   | ❌        | ✅               | ❌            | ❌             | ❌    |

### Available Functions

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

- `createGeminiChat(model, config)` - Note: Only supports credentials config, not binding

**Grok:**

- `createGrokChat(model, config)`
- `createGrokImage(model, config)`

## Usage Examples

### Chat with Different Providers

```typescript
// OpenAI
const openaiAdapter = createOpenAiChat("gpt-4o", config);

// Anthropic
const anthropicAdapter = createAnthropicChat("claude-sonnet-4-5", config);

// Gemini (credentials only)
const geminiAdapter = createGeminiChat("gemini-2.0-flash", {
  accountId: env.CF_ACCOUNT_ID,
  gatewayId: env.CF_AIG_ID,
  cfApiKey: env.CF_AIG_TOKEN,
});

// Grok
const grokAdapter = createGrokChat("grok-4", config);
```

### Streaming Chat

```typescript
import { chat, toHttpResponse } from "@tanstack/ai";

const response = chat({
  adapter: createOpenAiChat("gpt-4o", config),
  stream: true,
  messages: [{ role: "user", content: "Tell me a story" }],
});

return toHttpResponse(response);
```

### Image Generation

```typescript
import { generateImage } from "@tanstack/ai";

const result = await generateImage({
  adapter: createOpenAiImage("gpt-image-1", config),
  prompt: "A futuristic cityscape at sunset",
});

console.log(result.images[0].url);
```

### Text Summarization

```typescript
import { summarize } from "@tanstack/ai";

const result = await summarize({
  adapter: createOpenAiSummarize("gpt-4o", config),
  style: "paragraph",
  text: "Long text to summarize...",
});

console.log(result.summary);
```

## Links

- [TanStack AI Documentation](https://tanstack.com/ai)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
