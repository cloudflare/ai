---
"ai-gateway-provider": patch
---

Isolate per-request `fetch` configuration with a Proxy so concurrent AI Gateway calls cannot cross-wire shared `model.config.fetch`.
