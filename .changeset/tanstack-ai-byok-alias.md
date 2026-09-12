---
"@cloudflare/tanstack-ai": minor
---

Add `byokAlias` on the shared `AiGatewayConfig` so every gateway adapter (OpenAI, Anthropic, Gemini, Grok, OpenRouter, Workers AI) can select a stored BYOK key via `cf-aig-byok-alias`. `createGatewayFetch` forwards it on REST; Gemini maps the same field through `httpOptions.headers`. The AI binding ignores the header for third-party models.
