---
"workers-ai-provider": patch
---

Added AI Gateway e2e tests for the binding path. The test worker now accepts a `?gateway=<name>` query parameter to route requests through a specified AI Gateway, validating that the built-in `gateway` option works for chat, streaming, multi-turn, tool calling, structured output, embeddings, and image generation.
