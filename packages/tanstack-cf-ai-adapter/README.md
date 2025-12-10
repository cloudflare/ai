# @harshil1712/tanstack-cf-ai-adapter

Cloudflare AI Gateway adapter for [TanStack AI](https://tanstack.com/ai). Route your AI requests through [Cloudflare's AI Gateway](https://developers.cloudflare.com/ai-gateway/) to get caching, rate limiting, cost controls, and observability out of the box.

> ⚠️ **Alpha Release**: This package is in alpha. Standard authentication and BYOK work well. Unified Billing, caching, and rate limiting are not yet functional. See [Limitations](#limitations--notes) for details.

## Features

**✅ Working:**
- 🚀 **Standard Authentication** - Use provider API keys directly
- 🔑 **BYOK (Bring Your Own Keys)** - Store keys in Cloudflare dashboard
- 🌐 **Works with Cloudflare Workers** - Uses `env.AI.gateway()` binding
- 📊 **Built-in Analytics** - Track usage, costs, and performance
- 🔍 **Request Logging** - Monitor all AI requests
- 🎯 **Provider-specific adapters** - Optimized for OpenAI and Anthropic

**⚠️ Not Working:**
- 💰 **Unified Billing** - In progress, not functional yet
- 💾 **Request Caching** - Requires custom headers (not implemented)
- 🛡️ **Rate Limiting** - Requires custom configuration (not implemented)

## Installation

Install the alpha release:

```bash
npm install @harshil1712/tanstack-cf-ai-adapter@alpha @tanstack/ai
```

For production, you can pin to a specific alpha version:

```bash
npm install @harshil1712/tanstack-cf-ai-adapter@0.0.1-alpha.0
```

## Setup

### 1. Configure AI Gateway in Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → AI Gateway
2. Create a new gateway and note the gateway name

### 2. Configure wrangler.toml

Add the Workers AI binding to your `wrangler` configuration file:

```toml
name = "my-ai-worker"
main = "src/index.ts"
compatibility_date = "2024-12-05"

[ai]
binding = "AI"
```

### 3. Add binding types (TypeScript)

Create or update `worker-configuration.d.ts`:

```typescript
interface Env {
  AI: import('@harshil1712/tanstack-cf-ai-adapter').AIBinding
  ANTHROPIC_API_KEY: string
}
```

## Usage

### Authentication Modes

#### 1. Standard Authentication (✅ Working)

Pass provider API keys directly:

```typescript
const adapter = await openaiGateway(env.AI, "my-gateway", {
  apiKey: env.OPENAI_API_KEY
})
```

#### 2. BYOK - Bring Your Own Keys (✅ Working)

Store keys in Cloudflare dashboard, no keys in code:

```typescript
// First, store your key in Cloudflare dashboard:
// AI Gateway → your-gateway → Provider Keys → Add API Key

const adapter = await openaiGateway(env.AI, "my-gateway", {
  byok: true,
  cfToken: env.CF_API_TOKEN  // Cloudflare API token
})
```

**Benefits:**
- ✅ Keys stored securely in Cloudflare
- ✅ Easy key rotation via dashboard
- ✅ No keys in code or environment variables
- ✅ Centralized key management

#### 3. Unified Billing (⚠️ Not Working Yet)

Use Cloudflare's billing - no provider API keys needed:

```typescript
// ⚠️ This mode is not functional yet
const adapter = await openaiGateway(env.AI, "my-gateway", {
  unifiedBilling: true,
  cfToken: env.CF_API_TOKEN
})
```

**Expected Benefits (when implemented):**
- Single bill from Cloudflare
- Consolidated costs across providers
- Spend limits and auto top-up

## Advanced Features (⚠️ Not Yet Implemented)

### Gateway Features Configuration

These features are accepted in the API but not yet functional:

```typescript
// ⚠️ Cache, metadata, and logging options don't work yet
const adapter = await openaiGateway(env.AI, "my-gateway", {
  apiKey: env.OPENAI_API_KEY,
  cache: {
    ttl: 3600,      // Not implemented yet
    skipCache: false
  },
  metadata: {
    environment: 'production'  // Not implemented yet
  },
  logging: {
    skipLogging: false  // Not implemented yet
  }
})
```

These features require custom HTTP headers that aren't yet implemented.

## Supported Providers

All providers supported by both TanStack AI and Cloudflare AI Gateway:

- ✅ Anthropic (Claude)
- ✅ OpenAI (GPT models)

## How It Works

1. **`openaiGateway()` or `anthropicGateway()`** creates a configured adapter
2. **Calls `env.AI.gateway().getUrl(provider)`** to get the gateway URL
3. **Gateway URL is injected** into the adapter's `baseURL` config
4. **Adapter routes requests** through the gateway transparently
5. **Gateway features** (analytics, logging) are automatically enabled

```
Your App → TanStack AI → AI Gateway → AI Provider
                              ↓
                        Analytics
                        Logging
                        (Cache/Rate Limits not yet implemented)
```

## Configuration Reference

### `openaiGateway(binding, gatewayName, config)`

Creates an OpenAI adapter configured for AI Gateway.

**Parameters:**
- `binding: AIBinding` - The `env.AI` binding from wrangler.toml
- `gatewayName: string` - Your gateway name from Cloudflare dashboard
- `config: AuthConfig` - Authentication configuration

**Returns:** `Promise<Adapter>`

### `anthropicGateway(binding, gatewayName, config)`

Creates an Anthropic adapter configured for AI Gateway.

**Parameters:**
- `binding: AIBinding` - The `env.AI` binding from wrangler.toml
- `gatewayName: string` - Your gateway name from Cloudflare dashboard
- `config: AuthConfig` - Authentication configuration

**Returns:** `Promise<Adapter>`

### AuthConfig Options

**Standard Authentication:**
```typescript
{ apiKey: string }
```

**BYOK (✅ Working):**
```typescript
{ byok: true, cfToken: string }
```

**Unified Billing (⚠️ Not Working):**
```typescript
{ unifiedBilling: true, cfToken: string }
```

## Limitations & Notes

### ✅ What Works

**Fully functional and production-ready:**
- ✅ **Standard Authentication** - Provider API keys work perfectly
- ✅ **BYOK** - Store keys in Cloudflare dashboard, works great
- ✅ **Request Routing** - All requests route through AI Gateway
- ✅ **Analytics** - Usage tracking in Cloudflare dashboard
- ✅ **Logging** - Request logging automatically enabled
- ✅ **OpenAI Support** - Tested and working
- ✅ **Anthropic Support** - Tested and working

### ⚠️ What Doesn't Work Yet

**Not yet implemented:**
- ❌ **Unified Billing** - Accepted in API but not functional
- ❌ **Cache Control** - Requires custom HTTP headers
- ❌ **Custom Metadata** - Requires custom HTTP headers
- ❌ **Logging Controls** - Requires custom HTTP headers
- ❌ **Rate Limiting** - Not yet implemented

### Recommended Usage

**✅ Production Ready:**
```typescript
// Standard authentication - fully tested
const adapter = await openaiGateway(env.AI, "my-gateway", {
  apiKey: env.OPENAI_API_KEY
})

// BYOK - fully tested
const adapter = await anthropicGateway(env.AI, "my-gateway", {
  byok: true,
  cfToken: env.CF_API_TOKEN
})
```

**⚠️ Avoid for Now:**
```typescript
// Unified Billing - not working yet
const adapter = await openaiGateway(env.AI, "my-gateway", {
  unifiedBilling: true,  // ❌ Not functional
  cfToken: env.CF_API_TOKEN
})

// Cache/metadata options - silently ignored
const adapter = await openaiGateway(env.AI, "my-gateway", {
  apiKey: env.KEY,
  cache: { ttl: 3600 },  // ❌ Not implemented
  metadata: { env: "prod" }  // ❌ Not implemented
})
```

## Testing

### Quick Start

The `example/` directory contains a full-stack Hono + React + Vite application demonstrating the adapter.

```bash
cd example
npm install
npm run dev
```

See [example/README.md](./example/README.md) for detailed setup instructions.

### What's in the Example

- **Hono Worker** with streaming AI responses using `streamText()`
- **React Frontend** with Vite
- **API endpoints** for Anthropic and OpenAI
- **Full TypeScript** support with generated types
- **Production-ready** deployment configuration

## Examples

- See [`example/`](./example/) for a complete full-stack application
- See [`example.ts`](./example.ts) for standalone code examples

## Development

### Build

```bash
npm run build
```

### Testing

```bash
npm run dev    # Watch mode
```

## Resources

- [TanStack AI Documentation](https://tanstack.com/ai)
- [Cloudflare AI Gateway Docs](https://developers.cloudflare.com/ai-gateway/)
- [AI Gateway Binding Methods](https://developers.cloudflare.com/ai-gateway/integrations/worker-binding-methods/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)

## Contributing

This is an experimental/POC package. Feedback, issues, and PRs are welcome!

## License

MIT
