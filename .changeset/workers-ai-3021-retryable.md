---
"@cloudflare/gateway-core": patch
"workers-ai-provider": patch
---

Map Workers AI binding error `3021` (inference per-minute rate limit) to HTTP 429 so SDK retries treat it as retryable, matching gateway responses.
