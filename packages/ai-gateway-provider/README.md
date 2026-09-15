# AI Gateway Provider for Vercel AI SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This library provides an AI Gateway Provider for the [Vercel AI SDK](https://sdk.vercel.ai/docs), enabling you to seamlessly integrate multiple AI models from different providers behind a unified interface. It leverages Cloudflare's AI Gateway to manage and optimize your AI model usage.

## Features

- **Runtime Agnostic:** Works in all JavaScript runtimes supported by the Vercel AI SDK including Node.js, Edge Runtime, and more.
- **Automatic Provider Fallback:** ✨ Define an array of models and the provider will **automatically fallback** to the next available provider if one fails, ensuring high availability and resilience for your AI applications.

## Installation

```bash
npm install ai-gateway-provider
```

## Usage

### Basic Example with API Key

```typescript
import { createAiGateway } from "ai-gateway-provider";
import { createOpenAI } from "ai-gateway-provider/providers/openai";
import { generateText } from "ai";

const aigateway = createAiGateway({
	accountId: "{CLOUDFLARE_ACCOUNT_ID}",
	gateway: "{GATEWAY_NAME}",
	apiKey: "{CF_AIG_TOKEN}", // If your AI Gateway has authentication enabled
});

const openai = createOpenAI({ apiKey: "{OPENAI_API_KEY}" });

const { text } = await generateText({
	model: aigateway(openai.chat("gpt-5.1")),
	prompt: "Write a vegetarian lasagna recipe for 4 people.",
});
```

### Basic Examples with BYOK / Unified Billing

```typescript
import { createAiGateway } from "ai-gateway-provider";
import { createOpenAI } from "ai-gateway-provider/providers/openai";
import { generateText } from "ai";

const aigateway = createAiGateway({
	accountId: "{CLOUDFLARE_ACCOUNT_ID}",
	gateway: "{GATEWAY_NAME}",
	apiKey: "{CF_AIG_TOKEN}",
});

const openai = createOpenAI();

const { text } = await generateText({
	model: aigateway(openai.chat("gpt-5.1")),
	prompt: "Write a vegetarian lasagna recipe for 4 people.",
});
```

### Unified API / Dynamic Routes

```typescript
import { createAiGateway } from "ai-gateway-provider";
import { unified, createUnified } from "ai-gateway-provider/providers/unified";
import { generateText } from "ai";

const aigateway = createAiGateway({
	accountId: "{{CLOUDFLARE_ACCOUNT_ID}}",
	gateway: "{{GATEWAY_NAME}}",
	apiKey: "{{CF_AIG_TOKEN}}",
});

const { text } = await generateText({
	model: aigateway(unified("dynamic/customer-support")),
	prompt: "Write a vegetarian lasagna recipe for 4 people.",
});
```

## Automatic Fallback Example

```typescript
// Define multiple provider options with fallback priority
const model = aigateway([
	anthropic("claude-3-5-haiku-20241022"), // Primary choice
	openai.chat("gpt-4o-mini"), // First fallback
	mistral("mistral-large-latest"), // Second fallback
]);

// The system will automatically try the next model if previous ones fail
const { text } = await generateText({
	model,
	prompt: "Suggest three names for my tech startup.",
});
```

### Cloudflare AI Binding Example

Binding Benefits:

- Faster Requests: Saves milliseconds by avoiding open internet routing.
- Enhanced Security: Uses a special pre-authenticated pipeline.
- No Cloudflare API Token Required: Authentication is handled by the binding.

```typescript
const aigateway = createAiGateway({
	binding: env.AI.gateway("my-gateway"),
	options: {
		// Optional per-request override
		skipCache: true,
	},
});
const openai = createOpenAI({ apiKey: "openai api key" });
const anthropic = createAnthropic({ apiKey: "anthropic api key" });

const model = aigateway([
	anthropic("claude-3-5-haiku-20241022"), // Primary choice
	openai.chat("gpt-4o-mini"), // Fallback if first fails
]);

const { text } = await generateText({
	model: model,
	prompt: "Write a vegetarian lasagna recipe for 4 people.",
});
```

### Resumable Streaming (binding path)

> **🚧 Coming soon.** Resumable streaming is not generally available yet — the AI
> Gateway resume backend is still rolling out. The `resume` option below is in
> place so you can adopt it early, but treat resume as experimental until the
> rollout completes.

On the binding (run) path, you can opt into **resumable streaming**: when a
streaming run surfaces a `cf-aig-run-id`, a transient mid-stream drop reconnects
to the gateway resume endpoint transparently, so the downstream parser never
sees the break. Pass the full `env.AI` binding plus the gateway id under
`resume` (the reconnect uses `env.AI.fetch(...)`, so it needs the AI binding —
not the `env.AI.gateway(...)` sub-binding):

```typescript
const aigateway = createAiGateway({
	binding: env.AI.gateway("my-gateway"),
	resume: {
		binding: env.AI, // full AI binding for the resume fetch
		gateway: "my-gateway", // same gateway id
		onResumeExpired: "error", // or "accept-partial" (default: "error")
	},
});

const model = aigateway(openai.chat("gpt-5.1"));
const { textStream } = streamText({ model, prompt: "Tell me a long story." });
```

Resume is a no-op on the REST/API-key path (no `cf-aig-run-id` is available
there) and on non-streaming `generateText()` calls.

### Request-Level Options

You can now customize AI Gateway settings for each request:

```typescript
const aigateway = createAiGateway({
	// ... other configs

	options: {
		// all fields are optional!
		cacheKey: "my-custom-cache-key",
		cacheTtl: 3600, // Cache for 1 hour
		skipCache: false,
		metadata: {
			userId: "user123",
			requestType: "recipe",
		},
		retries: {
			maxAttempts: 3,
			retryDelayMs: 1000,
			backoff: "exponential",
		},
		// BYOK stored-key alias to authenticate with (cf-aig-byok-alias)
		byokAlias: "my-openai-key",
		// Per-request Zero Data Retention override for Unified Billing (cf-aig-zdr)
		zdr: true,
	},
});
```

> Cache controls map to the current `cf-aig-cache-ttl` / `cf-aig-skip-cache` /
> `cf-aig-cache-key` headers (the older `cf-cache-ttl` / `cf-skip-cache` names are
> deprecated upstream). Header building is shared with the `workers-ai-provider`
> AI Gateway delegate, so the two stay in lockstep.

## Configuration

### `createAiGateway(options: AiGatewaySettings)`

#### API Key Authentication

- `accountId`: Your Cloudflare account ID
- `gateway`: The name of your AI Gateway
- `apiKey` (Optional): Your Cloudflare API key

#### Cloudflare AI Binding

- `binding`: Cloudflare AI Gateway binding
- `options` (Optional): Request-level AI Gateway settings

### Request Options

- `cacheKey`: Custom cache key for the request
- `cacheTtl`: Cache time-to-live in seconds
- `skipCache`: Bypass caching for the request
- `metadata`: Custom metadata for the request
- `collectLog`: Enable/disable log collection
- `eventId`: Custom event identifier
- `requestTimeoutMs`: Request timeout in milliseconds
- `retries`: Retry configuration
    - `maxAttempts`: Number of retry attempts (1-5)
    - `retryDelayMs`: Delay between retries
    - `backoff`: Retry backoff strategy ('constant', 'linear', 'exponential')
- `byokAlias`: BYOK stored-key alias to authenticate with (`cf-aig-byok-alias`)
- `zdr`: Per-request Zero Data Retention override for Unified Billing (`cf-aig-zdr`)

### Google AI Studio Example

```typescript
import { createAiGateway } from "ai-gateway-provider";
import { createGoogle } from "ai-gateway-provider/providers/google";
import { generateText } from "ai";

const aigateway = createAiGateway({
	accountId: "{CLOUDFLARE_ACCOUNT_ID}",
	gateway: "{GATEWAY_NAME}",
});

const google = createGoogle({ apiKey: "{GOOGLE_API_KEY}" });

const { text } = await generateText({
	model: aigateway(google("gemini-1.5-pro")),
	prompt: "Write a vegetarian lasagna recipe for 4 people.",
});
```

## Supported Providers

The provider routing table is shared with the `workers-ai-provider` AI Gateway
delegate, so support stays in sync. Currently routed providers include:

- OpenAI
- Anthropic
- DeepSeek
- Google AI Studio
- Google Vertex AI
- Grok
- Mistral
- Perplexity AI
- Replicate
- Groq
- Azure OpenAI
- OpenRouter
- The unified `compat` endpoint (`ai-gateway-provider/providers/unified`)

## Supported Methods

The following methods are supported:

- **Text generation**: `generateText()` from the Vercel AI SDK
- **Streaming text generation**: `streamText()` (streams through the gateway universal endpoint)
- **Chat completions**: `generateText()` / `streamText()` with message-based prompts

More can be added, please open an issue in the GitHub repository!

## Error Handling

The library throws the following custom errors:

- `AiGatewayUnauthorizedError`: Your AI Gateway has authentication enabled, but a valid API key was not provided.
- `AiGatewayDoesNotExist`: Specified AI Gateway does not exist

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/cloudflare/ai/blob/main/LICENSE) file for details.

## Relevant Links

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [Cloudflare AI Gateway Documentation](https://developers.cloudflare.com/ai-gateway/)
- [GitHub Repository](https://github.com/cloudflare/ai)
