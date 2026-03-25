---
"@cloudflare/tanstack-ai": patch
---

Add maxTokens support to WorkersAi chat and handle non-string responses

- Forward `maxTokens` from `TextOptions` to the Workers AI binding as `max_tokens` in both streaming and non-streaming paths.
- Stringify object responses from the binding when building assistant messages instead of defaulting to empty string.
