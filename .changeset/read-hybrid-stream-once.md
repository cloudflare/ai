---
"workers-ai-provider": patch
---

Read each streamed piece once when Workers AI sends it twice. Llama models (for example `@cf/meta/llama-3.3-70b-instruct-fp8-fast` and `@cf/meta/llama-4-scout-17b-16e-instruct`) put the same text in `response` and in `choices[0].delta.content`, and the same tool-call piece in `tool_calls` and in `choices[0].delta.tool_calls`, within one event. The text was emitted twice ("TheThe capital capital…") and tool-call arguments were concatenated twice, so they failed to parse. Text is now read from `response` when it has any, and tool calls from the delta when it has any.
