---
"workers-ai-provider": patch
---

Fix streaming text/reasoning deltas being silently dropped when Workers AI's OpenAI-compatible SSE stream serialises a numeric-looking token (e.g. `6`, `0.005`) as a JSON number instead of a string. `delta.content` and `delta.reasoning_content`/`delta.reasoning` are now coerced to strings before the empty-check, matching how the native `response` field and the non-streaming path already handle this.
