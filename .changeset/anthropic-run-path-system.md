---
"workers-ai-provider": patch
---

Fix Anthropic models on the unified-billing run path (`env.AI.run`) failing whenever a system prompt is set. `@ai-sdk/anthropic` sends `system` as an array of text blocks, which the run path rejects with `7003: Invalid value at system: Invalid input: expected string, received array`; text-only blocks are now joined into a string on that path. The gateway path is unchanged.
