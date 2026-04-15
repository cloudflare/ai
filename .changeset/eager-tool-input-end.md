---
"workers-ai-provider": patch
---

Emit `tool-input-end` and `tool-call` events eagerly when streaming multiple tool calls, instead of deferring all of them to stream close. Previously, all tool calls appeared "in progress" simultaneously because `tool-input-end` was only emitted in `flush()`. Now each tool call is closed as soon as the next one starts or a null finalization chunk is received, matching the behavior of other AI SDK providers.
