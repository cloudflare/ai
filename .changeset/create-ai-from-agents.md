---
"workers-ai-provider": patch
"ai-gateway-provider": patch
---

Deprecate the binding paths that `createAI` from `agents/models/ai-sdk` replaces.

- `workers-ai-provider`: `createWorkersAI({ binding })`, the `openai` / `anthropic` / `google` provider plugins, `createGatewayFetch` / `createGatewayProvider` (`workers-ai-provider/gateway`), and `createClientFallbackModel`.
- `ai-gateway-provider`: `createAiGateway({ binding })`.

Nothing changes at runtime. Credentials mode for `createWorkersAI`, REST mode for `createAiGateway`, and AI Search are not deprecated, because `createAI` only supports the binding.
