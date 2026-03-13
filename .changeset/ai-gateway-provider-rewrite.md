---
"ai-gateway-provider": major
---

Rewrote the AI Gateway provider with a new API. `createAIGateway` now wraps any standard AI SDK provider as a drop-in replacement — no more importing wrapped providers from `ai-gateway-provider/providers/*`.

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
- Fixed fetch mutation not being restored after gateway calls
- Removed unanchored Google Vertex regex that could match unintended URLs
- Fixed query parameter loss for custom URLs with `providerName`

**Breaking changes:**

- `createAiGateway` → `createAIGateway` (new API shape — takes `provider` instead of model arrays)
- Removed all `ai-gateway-provider/providers/*` subpath exports
- Removed `@ai-sdk/openai-compatible` from peer dependencies
- Removed all `optionalDependencies`
- Fallback is now a separate `createAIGatewayFallback` function
