# AI Gateway Provider for Vercel AI SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This library provides an AI Gateway Provider for the [Vercel AI SDK](https://sdk.vercel.ai/docs), enabling you to seamlessly integrate multiple AI models from different providers behind a unified interface. It leverages Cloudflare's AI Gateway to manage and optimize your AI model usage.

## Features

* **Runtime Agnostic:** Works in all JavaScript runtimes supported by the Vercel AI SDK including Node.js, Edge Runtime, and more.
* **Automatic Provider Fallback:** ✨ Define an array of models and the provider will **automatically fallback** to the next available provider if one fails, ensuring high availability and resilience for your AI applications.
* **Multi-Provider Support:** Easily switch between and combine models from various providers like OpenAI, Anthropic, DeepSeek, Google AI Studio, Grok, Mistral, Perplexity AI, Replicate and Groq.
* **AI Gateway Integration:** Utilizes Cloudflare's AI Gateway for advanced features like request management, caching, and rate limiting.
* **Simplified Model Management:** Abstracts away the complexities of interacting with different AI provider APIs.
* **Easy Configuration:** Simple and intuitive setup process.

## Installation

```bash
npm install ai-gateway-provider
```

## Usage

### Basic Example with API Key

```typescript
import {createOpenAI} from '@ai-sdk/openai';
import {createAiGateway} from 'ai-gateway-provider';
import {generateText} from "ai";
import {createAnthropic} from "@ai-sdk/anthropic";

const aigateway = createAiGateway({
  accountId: "my-cloudflare-account-id",
  gateway: 'my-gateway-name',
  apiKey: 'optionally my cloudflare api key',
  options: {  // Optional per-request override
    skipCache: true
  }
});
const openai = createOpenAI({apiKey: 'openai api key'});
const anthropic = createAnthropic({apiKey: 'anthropic api key'});

const model = aigateway([
  anthropic('claude-3-5-haiku-20241022'),  // Primary choice
  openai("gpt-4o-mini"),                   // Fallback if first fails
]);

const {text} = await generateText({
  model: model,
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

### Cloudflare AI Binding Example

Binding Benefits:
- Faster Requests: Saves milliseconds by avoiding open internet routing.
- Enhanced Security: Uses a special pre-authenticated pipeline.
- No API Key Required: Authentication is handled by the binding.

```typescript
const aigateway = createAiGateway({
  binding: env.AI.gateway('my-gateway'),
  options: {  // Optional per-request override
    skipCache: true
  }
});
const openai = createOpenAI({apiKey: 'openai api key'});
const anthropic = createAnthropic({apiKey: 'anthropic api key'});

const model = aigateway([
  anthropic('claude-3-5-haiku-20241022'),  // Primary choice
  openai("gpt-4o-mini"),                   // Fallback if first fails
]);

const {text} = await generateText({
  model: model,
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

### Request-Level Options

You can now customize AI Gateway settings for each request:

```typescript
const aigateway = createAiGateway({
  // ... other configs

  options: {  // all fields are optional!
    cacheKey: 'my-custom-cache-key',
    cacheTtl: 3600,  // Cache for 1 hour
    skipCache: false,
    metadata: {
      userId: 'user123',
      requestType: 'recipe'
    },
    retries: {
      maxAttempts: 3,
      retryDelayMs: 1000,
      backoff: 'exponential'
    }
  },
});
```

## Configuration

### `createAiGateway(options: AiGatewaySettings)`

#### API Key Authentication
* `accountId`: Your Cloudflare account ID
* `gateway`: The name of your AI Gateway
* `apiKey` (Optional): Your Cloudflare API key

#### Cloudflare AI Binding
* `binding`: Cloudflare AI Gateway binding
* `options` (Optional): Request-level AI Gateway settings

### Request Options

* `cacheKey`: Custom cache key for the request
* `cacheTtl`: Cache time-to-live in seconds
* `skipCache`: Bypass caching for the request
* `metadata`: Custom metadata for the request
* `collectLog`: Enable/disable log collection
* `eventId`: Custom event identifier
* `requestTimeoutMs`: Request timeout in milliseconds
* `retries`: Retry configuration
  * `maxAttempts`: Number of retry attempts (1-5)
  * `retryDelayMs`: Delay between retries
  * `backoff`: Retry backoff strategy ('constant', 'linear', 'exponential')

## Automatic Fallback Example

```typescript
// Define multiple provider options with fallback priority
const model = aigateway([
  anthropic('claude-3-5-haiku-20241022'),  // Primary choice
  openai("gpt-4o-mini"),                   // First fallback
  mistral("mistral-large-latest"),         // Second fallback
]);

// The system will automatically try the next model if previous ones fail
const {text} = await generateText({
  model: model,
  prompt: 'Suggest three names for my tech startup.',
});
```

## Supported Providers

* OpenAI
* Anthropic
* DeepSeek
* Google AI Studio
* Grok
* Mistral
* Perplexity AI
* Replicate
* Groq

## Supported Methods

Currently, the following methods are supported:

* **Non-streaming text generation**: Using `generateText()` from the Vercel AI SDK
* **Chat completions**: Using `generateText()` with message-based prompts

More can be added, please open an issue in the GitHub repository!

## Error Handling

The library throws the following custom errors:

* `AiGatewayUnauthorizedError`: Your AI Gateway has authentication enabled, but a valid API key was not provided.
* `AiGatewayDoesNotExist`: Specified AI Gateway does not exist

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/cloudflare/ai/blob/main/LICENSE) file for details.

## Relevant Links

* [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
* [Cloudflare AI Gateway Documentation](https://developers.cloudflare.com/ai-gateway/)
* [GitHub Repository](https://github.com/cloudflare/ai)
