---
"workers-ai-provider": patch
---

Normalize retryable Workers AI binding errors into standard `APICallError` with `isRetryable: true` at the `AI.run()` transport boundary to enable automatic AI SDK retries.
