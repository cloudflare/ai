---
"ai-gateway-provider": patch
"workers-ai-provider": patch
"@cloudflare/tanstack-ai": patch
---

Fix request cancellation by propagating `abortSignal` to outbound network calls.

**ai-gateway-provider**: Pass `abortSignal` to the `fetch` call (API path) and to `binding.run()` (binding path) so that cancelled requests are properly aborted.

**workers-ai-provider**: Pass `abortSignal` to `binding.run()` for chat, embedding, and image models, matching the existing behavior in transcription, speech, and reranking models.

**@cloudflare/tanstack-ai**: Pass `signal` through to `binding.run()` in both `createGatewayFetch` (AI Gateway binding path) and `createWorkersAiBindingFetch` (Workers AI binding path).
