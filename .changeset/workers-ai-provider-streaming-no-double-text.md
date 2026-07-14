---
"workers-ai-provider": patch
---

Fix doubled streaming text. Workers AI's OpenAI-compatible streaming emits both the native top-level `response` field and `choices[0].delta.content` in the same SSE chunk with identical content; the stream mapper emitted a `text-delta` for each, doubling every token (e.g. `"Hello world"` → `"HelloHello world world"`). The two are now treated as mutually exclusive — `choices[0].delta.content` is used only when the native `response` field is absent for that chunk.
