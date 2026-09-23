---
"workers-ai-provider": patch
---

Fix doubled streamed text and tool-call arguments on dual-format chunks. Workers AI's `/ai/run` streaming mirrors each payload into the native top-level fields and the OpenAI-compatible `choices[0].delta` in the same chunk — `response` alongside `delta.content`, and `tool_calls` alongside `delta.tool_calls` — and the stream mapper handled each pair in two independent `if` blocks, emitting everything twice. Text arrived doubled (`"Hello world"` → `"HelloHello world world"`), and tool-call arguments accumulated as `{"location": "{"location": "LondonLondon"}"}`, which fails `JSON.parse` so the AI SDK rejects the call with `AI_InvalidToolInputError` before the tool runs. The pairs are now treated as the aliases they are: the native blocks defer whenever the OpenAI copy is present for that chunk, preferring it because it carries `id`, `index` and `type` where the native mirror carries only `arguments`.
