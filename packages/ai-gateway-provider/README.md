# AI Gateway Provider for Vercel AI SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Route any [Vercel AI SDK](https://sdk.vercel.ai/docs) provider through [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/). Wrap your provider with `createAIGateway` and use it exactly as before — caching, logging, rate limiting, retries, and analytics are handled by the gateway.

## Installation

```bash
npm install ai-gateway-provider
```

You also need the AI SDK core and at least one provider:

```bash
npm install ai @ai-sdk/openai
```

## Quick start

```typescript
import { createAIGateway } from "ai-gateway-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const gateway = createAIGateway({
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	gateway: "my-gateway",
	apiKey: process.env.CLOUDFLARE_API_TOKEN, // if gateway auth is enabled
	provider: openai,
});

const { text } = await generateText({
	model: gateway("gpt-4o-mini"),
	prompt: "Write a haiku about clouds.",
});
```

## Configuration modes

### REST API mode

For use outside Cloudflare Workers. Requests go over the public internet to `gateway.ai.cloudflare.com`.

```typescript
const gateway = createAIGateway({
	provider: openai,
	accountId: "your-account-id",
	gateway: "your-gateway-name",
	apiKey: "your-cf-api-token", // optional, required if gateway auth is on
});
```

### Cloudflare Worker binding mode

For use inside Cloudflare Workers. Faster (no public internet hop), more secure (pre-authenticated), and no API token needed.

```typescript
export default {
	async fetch(request, env) {
		const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });

		const gateway = createAIGateway({
			provider: openai,
			binding: env.AI.gateway("my-gateway"),
		});

		const { text } = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello!",
		});

		return new Response(text);
	},
};
```

Requires an `ai` binding in your `wrangler.jsonc`:

```jsonc
{
	"ai": { "binding": "AI" },
}
```

### BYOK / Unified Billing (no provider API key)

With [BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/) or [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/), Cloudflare manages the provider credentials — you don't need a real API key. Set `byok: true` and pass any string as the provider's API key:

```typescript
const openai = createOpenAI({ apiKey: "unused" });

const gateway = createAIGateway({
	provider: openai,
	byok: true, // strips provider auth headers so the gateway uses its stored key
	binding: env.AI.gateway("my-gateway"),
	options: {
		byokAlias: "production", // optional: select a specific stored key alias
	},
});

const { text } = await generateText({
	model: gateway("gpt-4o-mini"),
	prompt: "Hello!",
});
```

The dummy key satisfies the provider SDK's initialization. `byok: true` strips the provider auth headers (e.g., `Authorization`, `x-api-key`) from the request before sending it to the gateway, so the gateway uses its stored BYOK key (or Unified Billing credits) instead.

> **Note:** If you use the default provider export (e.g., `import { openai } from "@ai-sdk/openai"`) instead of `createOpenAI()`, it reads from the `OPENAI_API_KEY` environment variable. Set it to any value: `OPENAI_API_KEY=unused`.

## Gateway options

Pass `options` to control caching, logging, retries, and more. These are sent as headers to the AI Gateway and apply to every request through that gateway instance.

```typescript
const gateway = createAIGateway({
	provider: openai,
	accountId: "...",
	gateway: "my-gateway",
	options: {
		// Caching
		cacheTtl: 3600, // cache responses for 1 hour (seconds)
		skipCache: false, // bypass the cache for this request
		cacheKey: "my-key", // custom cache key

		// Logging
		collectLog: true, // override the gateway's default log setting

		// Observability
		metadata: { userId: "u123", env: "prod" }, // up to 5 entries
		eventId: "evt-abc", // correlation ID

		// Reliability
		requestTimeoutMs: 10000, // request timeout
		retries: {
			maxAttempts: 3, // 1–5
			retryDelayMs: 1000,
			backoff: "exponential", // "constant" | "linear" | "exponential"
		},

		// BYOK
		byokAlias: "production", // select a stored key alias

		// Zero Data Retention (Unified Billing only)
		zdr: true, // route through ZDR-capable endpoints
	},
});
```

## Streaming

Works with `streamText` exactly as you'd expect:

```typescript
import { streamText } from "ai";

const result = streamText({
	model: gateway("gpt-4o-mini"),
	prompt: "Write a poem about clouds.",
});

for await (const chunk of result.textStream) {
	process.stdout.write(chunk);
}
```

## Fallback

Use `createAIGatewayFallback` to define a chain of models. The AI Gateway tries each in order and returns the first successful response. All models are sent in a single gateway request — the gateway handles the fallback logic server-side.

```typescript
import { createAIGatewayFallback } from "ai-gateway-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const model = createAIGatewayFallback({
	// Gateway config (shared across all models)
	accountId: "your-account-id",
	gateway: "my-gateway",
	apiKey: "your-cf-token",
	// Models to try, in order
	models: [
		openai("gpt-4o"), // primary
		openai("gpt-4o-mini"), // fallback
	],
});

const { text } = await generateText({ model, prompt: "Hello!" });
```

Works with bindings too:

```typescript
const model = createAIGatewayFallback({
	binding: env.AI.gateway("my-gateway"),
	models: [openai("gpt-4o"), openai("gpt-4o-mini")],
});
```

Models from different providers can be mixed — as long as each URL is auto-detected from the [provider registry](#supported-providers):

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

const model = createAIGatewayFallback({
	binding: env.AI.gateway("my-gateway"),
	models: [
		createAnthropic({ apiKey: "..." })("claude-sonnet-4-20250514"),
		createOpenAI({ apiKey: "..." })("gpt-4o"),
	],
});
```

## Multi-provider routing

If you use models from multiple providers, you can combine `createAIGateway` with the AI SDK's built-in [`createProviderRegistry`](https://sdk.vercel.ai/docs/ai-sdk-core/provider-management#provider-registry) to route by model name — all through the gateway:

```typescript
import { createProviderRegistry } from "ai";
import { createAIGateway } from "ai-gateway-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

const openai = createAIGateway({
	provider: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
	binding: env.AI.gateway("my-gateway"),
});

const anthropic = createAIGateway({
	provider: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
	binding: env.AI.gateway("my-gateway"),
});

const registry = createProviderRegistry({ openai, anthropic });

// Route by prefix — each request goes through AI Gateway
const { text } = await generateText({
	model: registry.languageModel("openai:gpt-4o"),
	prompt: "Hello!",
});

const { text: text2 } = await generateText({
	model: registry.languageModel("anthropic:claude-sonnet-4-20250514"),
	prompt: "Hello!",
});
```

This preserves provider-specific features (like Anthropic's prompt caching) since each provider uses its native SDK, while routing all traffic through AI Gateway for caching, logging, and analytics.

## Custom base URLs (`providerName`)

If your provider uses a non-standard base URL (proxy, self-hosted, etc.), the gateway can't auto-detect which provider it is from the URL. Set `providerName` explicitly:

```typescript
const openai = createOpenAI({
	apiKey: "...",
	baseURL: "https://my-proxy.example.com/v1",
});

const gateway = createAIGateway({
	provider: openai,
	providerName: "openai", // tells the gateway which provider this is
	accountId: "...",
	gateway: "my-gateway",
});
```

When `providerName` is set:

- The gateway uses that name instead of auto-detecting from the URL
- If the URL matches a known provider, the smart endpoint transform is still used
- If the URL doesn't match, the URL pathname is used as the endpoint

## Unified API (compat endpoint)

The AI Gateway offers an OpenAI-compatible endpoint that can route to any provider. Use the standard OpenAI SDK pointed at the compat base URL:

```typescript
import { createOpenAI } from "@ai-sdk/openai";

const compat = createOpenAI({
	apiKey: "unused", // BYOK or Unified Billing handles auth
	baseURL: "https://gateway.ai.cloudflare.com/v1/compat",
});

const gateway = createAIGateway({
	provider: compat,
	accountId: "...",
	gateway: "my-gateway",
	apiKey: "your-cf-token",
});

// Use any provider's model via the compat endpoint
const { text } = await generateText({
	model: gateway("google-ai-studio/gemini-2.5-pro"),
	prompt: "Hello!",
});
```

This also works with [Dynamic Routes](https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/) — use your route name as the model (e.g., `gateway("dynamic/support")`).

## API reference

### `createAIGateway(config)`

Wraps a provider so all its requests go through AI Gateway. Returns a function with the same call signature as the original provider.

| Field          | Type              | Required     | Description                                               |
| -------------- | ----------------- | ------------ | --------------------------------------------------------- |
| `provider`     | Provider function | Yes          | Any AI SDK provider (e.g., `openai`, `createOpenAI(...)`) |
| `providerName` | string            | No           | Explicit provider name for the gateway (see above)        |
| `byok`         | boolean           | No           | Strip provider auth headers for BYOK / Unified Billing    |
| `accountId`    | string            | REST only    | Your Cloudflare account ID                                |
| `gateway`      | string            | REST only    | Name of your AI Gateway                                   |
| `apiKey`       | string            | No           | Cloudflare API token (if gateway auth is enabled)         |
| `binding`      | object            | Binding only | `env.AI.gateway("name")` binding                          |
| `options`      | AiGatewayOptions  | No           | Gateway options (see table below)                         |

### `createAIGatewayFallback(config)`

Creates a fallback chain of models behind a single gateway. The gateway tries each model in order and returns the first successful response.

| Field       | Type              | Required     | Description                                            |
| ----------- | ----------------- | ------------ | ------------------------------------------------------ |
| `models`    | LanguageModelV3[] | Yes          | Models to try, in priority order                       |
| `byok`      | boolean           | No           | Strip provider auth headers for BYOK / Unified Billing |
| `accountId` | string            | REST only    | Your Cloudflare account ID                             |
| `gateway`   | string            | REST only    | Name of your AI Gateway                                |
| `apiKey`    | string            | No           | Cloudflare API token                                   |
| `binding`   | object            | Binding only | `env.AI.gateway("name")` binding                       |
| `options`   | AiGatewayOptions  | No           | Gateway options (see below)                            |

### Gateway options

| Option                 | Type    | Header                   | Description                                  |
| ---------------------- | ------- | ------------------------ | -------------------------------------------- |
| `cacheTtl`             | number  | `cf-aig-cache-ttl`       | Cache TTL in seconds (min 60, max 1 month)   |
| `skipCache`            | boolean | `cf-aig-skip-cache`      | Bypass the cache                             |
| `cacheKey`             | string  | `cf-aig-cache-key`       | Custom cache key                             |
| `metadata`             | object  | `cf-aig-metadata`        | Up to 5 key-value pairs for tagging requests |
| `collectLog`           | boolean | `cf-aig-collect-log`     | Override default log collection setting      |
| `eventId`              | string  | `cf-aig-event-id`        | Custom event / correlation ID                |
| `requestTimeoutMs`     | number  | `cf-aig-request-timeout` | Request timeout in milliseconds              |
| `retries.maxAttempts`  | 1–5     | `cf-aig-max-attempts`    | Number of retry attempts                     |
| `retries.retryDelayMs` | number  | `cf-aig-retry-delay`     | Delay between retries (ms)                   |
| `retries.backoff`      | string  | `cf-aig-backoff`         | `"constant"`, `"linear"`, or `"exponential"` |
| `byokAlias`            | string  | `cf-aig-byok-alias`      | Select a stored BYOK key alias               |
| `zdr`                  | boolean | `cf-aig-zdr`             | Zero Data Retention (Unified Billing only)   |

### Error classes

| Error                        | When                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `AiGatewayDoesNotExist`      | The specified gateway name doesn't exist                  |
| `AiGatewayUnauthorizedError` | Gateway auth is enabled but no valid API key was provided |

### `resolveProvider(url, providerName?)`

Exported utility that matches a URL against the provider registry. Returns `{ name, endpoint }`. Throws if no match and no `providerName` is given.

## Workers AI

Workers AI uses a binding (`env.AI.run()`) rather than HTTP, so it can't be wrapped with `createAIGateway`. It has built-in gateway support instead:

```typescript
import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";

const workersAI = createWorkersAI({
	binding: env.AI,
	gateway: { id: "my-gateway" },
});

const { text } = await generateText({
	model: workersAI("@cf/meta/llama-3.1-8b-instruct-fast"),
	prompt: "Hello!",
});
```

This routes Workers AI requests through the AI Gateway natively — no wrapping needed. All gateway features (caching, logging, analytics) apply.

> **Note:** The `gateway` option only works with the binding. In REST mode (`createWorkersAI({ accountId, apiKey })`), the gateway option is ignored. For REST + gateway, use the binding approach inside a Cloudflare Worker instead.

## Supported providers

Auto-detected from URL (no `providerName` needed):

| Provider         | AI SDK Package                | Gateway Name       |
| ---------------- | ----------------------------- | ------------------ |
| OpenAI           | `@ai-sdk/openai`              | `openai`           |
| Anthropic        | `@ai-sdk/anthropic`           | `anthropic`        |
| Google AI Studio | `@ai-sdk/google`              | `google-ai-studio` |
| Google Vertex AI | `@ai-sdk/google-vertex`       | `google-vertex-ai` |
| Mistral          | `@ai-sdk/mistral`             | `mistral`          |
| Groq             | `@ai-sdk/groq`                | `groq`             |
| xAI / Grok       | `@ai-sdk/xai`                 | `grok`             |
| Perplexity       | `@ai-sdk/perplexity`          | `perplexity-ai`    |
| DeepSeek         | `@ai-sdk/deepseek`            | `deepseek`         |
| Azure OpenAI     | `@ai-sdk/azure`               | `azure-openai`     |
| Amazon Bedrock   | `@ai-sdk/amazon-bedrock`      | `aws-bedrock`      |
| Cerebras         | `@ai-sdk/cerebras`            | `cerebras`         |
| Cohere           | `@ai-sdk/cohere`              | `cohere`           |
| Deepgram         | `@ai-sdk/deepgram`            | `deepgram`         |
| ElevenLabs       | `@ai-sdk/elevenlabs`          | `elevenlabs`       |
| Fireworks        | `@ai-sdk/fireworks`           | `fireworks`        |
| OpenRouter       | `@openrouter/ai-sdk-provider` | `openrouter`       |
| Replicate        | —                             | `replicate`        |
| HuggingFace      | —                             | `huggingface`      |
| Cartesia         | —                             | `cartesia`         |
| Fal AI           | —                             | `fal`              |
| Ideogram         | —                             | `ideogram`         |

Any other provider works with `providerName` set explicitly.

## Migrating from the old API

If you're upgrading from the previous version (`createAiGateway` + `ai-gateway-provider/providers/*`), your existing code still works — you'll see deprecation warnings in the console guiding you to the new API. No changes are required immediately.

### What changed

**Before:**

```typescript
import { createAiGateway } from "ai-gateway-provider";
import { createOpenAI } from "ai-gateway-provider/providers/openai"; // ← deprecated

const aigateway = createAiGateway({ accountId, gateway, apiKey });
const openai = createOpenAI({ apiKey });
generateText({ model: aigateway([openai.chat("gpt-4o")]), prompt: "..." });
```

**After:**

```typescript
import { createAIGateway } from "ai-gateway-provider";
import { createOpenAI } from "@ai-sdk/openai"; // ← import directly

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const gateway = createAIGateway({
	provider: openai,
	accountId: "...",
	gateway: "my-gateway",
});
generateText({ model: gateway("gpt-4o"), prompt: "..." });
```

### Step by step

1. **Replace provider imports** — change `from "ai-gateway-provider/providers/openai"` to `from "@ai-sdk/openai"` (and so on for each provider). Install the `@ai-sdk/*` package directly if you haven't already.

2. **Replace `createAiGateway`** — use `createAIGateway` (capital `I`) with a `provider` field instead of wrapping model arrays.

3. **Replace fallback** — if you passed an array to `createAiGateway(config)([model1, model2])`, use `createAIGatewayFallback({ models: [...], ...config })` instead.

4. **Update BYOK** — if you relied on the old provider wrappers injecting a dummy API key (the `CF_TEMP_TOKEN` mechanism), set `byok: true` on `createAIGateway` and pass any string as the provider's API key (e.g., `createOpenAI({ apiKey: "unused" })`).

### Deprecated APIs

All of the following still work but emit a one-time console warning. They will be removed in the next major version.

| Deprecated | Replacement |
|---|---|
| `createAiGateway()` | `createAIGateway()` / `createAIGatewayFallback()` |
| `import { createOpenAI } from "ai-gateway-provider/providers/openai"` | `import { createOpenAI } from "@ai-sdk/openai"` |
| `AiGatewaySettings` type | `AiGatewayConfig` |
| `AiGatewayAPISettings` type | `AiGatewayAPIConfig` |
| `AiGatewayBindingSettings` type | `AiGatewayBindingConfig` |

## Testing

### Unit tests

```bash
npm run test:unit
```

No credentials needed — uses mocked HTTP via msw.

### Integration tests (binding + REST API)

Tests against real AI Gateways in both binding mode (via a Worker) and REST API mode (direct HTTP).

**Prerequisites:**

1. `npx wrangler login` (one-time)
2. Two AI Gateways in your Cloudflare dashboard:
    - One **unauthenticated** (no `cf-aig-authorization` required)
    - One **authenticated** (with BYOK configured for OpenAI)

**Setup:**

1. Copy `test/integration/.env.example` to `test/integration/.env` and fill in your values

**Run:**

```bash
npm run test:integration
```

The test runner starts `wrangler dev` automatically for binding tests. Tests skip when credentials aren't configured.

## License

MIT — see [LICENSE](https://github.com/cloudflare/ai/blob/main/LICENSE).

## Links

- [Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/)
- [Vercel AI SDK docs](https://sdk.vercel.ai/docs)
- [GitHub repo](https://github.com/cloudflare/ai)
