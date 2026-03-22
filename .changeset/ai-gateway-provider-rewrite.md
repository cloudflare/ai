---
"ai-gateway-provider": minor
---

Rewrote the AI Gateway provider with a new API. `createAIGateway` now wraps any standard AI SDK provider — import directly from `@ai-sdk/*` instead of `ai-gateway-provider/providers/*`.

**New features:**

- `createAIGateway({ provider, binding/accountId })` — wraps any AI SDK provider
- `createAIGatewayFallback({ models, binding/accountId })` — cross-provider fallback
- `providerName` — explicit provider name for custom base URLs
- `byok: true` — strips provider auth headers for BYOK/Unified Billing
- `byokAlias` and `zdr` gateway options
- 22 providers auto-detected from URL (up from 13)
- `resolveProvider` exported as a utility

**Bug fixes:**

- Updated stale cache header names (`cf-skip-cache` → `cf-aig-skip-cache`, `cf-cache-ttl` → `cf-aig-cache-ttl`)
- Fixed BYOK leaking dummy API keys (`Authorization: Bearer unused` was forwarded to the provider)
- Fixed fetch mutation not being restored after gateway calls
- Removed unanchored Google Vertex regex that could match unintended URLs
- Fixed query parameter loss for custom URLs with `providerName`
- Propagate abort signals to binding and fetch calls

**Deprecated (all still work, with a one-time console warning):**

- `createAiGateway()` — use `createAIGateway()` (wraps a provider) or `createAIGatewayFallback()` (cross-provider fallback) instead
- `ai-gateway-provider/providers/*` subpath imports — import directly from `@ai-sdk/*` and use `createAIGateway()` instead
- Old type names: `AiGatewaySettings` → `AiGatewayConfig`, `AiGatewayAPISettings` → `AiGatewayAPIConfig`, `AiGatewayBindingSettings` → `AiGatewayBindingConfig`, `AiGatewayReties` → `AiGatewayRetries`

All deprecated APIs will be removed in the next major version.
