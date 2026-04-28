---
"workers-ai-provider": patch
---

Map `inputTokens.cacheRead` and `inputTokens.noCache` from Workers AI's `usage.prompt_tokens_details.cached_tokens` instead of always reporting them as `undefined`. This makes prompt-cache hits visible to consumers that compute pricing or telemetry from `LanguageModelV3Usage` (`generateText`/`streamText` `result.usage`).

`cached_tokens` is treated as `cacheRead`; `cacheWrite` remains `undefined` because the OpenAI-style usage shape Workers AI returns does not distinguish cache reads from writes.

Closes [#509](https://github.com/cloudflare/ai/issues/509).
