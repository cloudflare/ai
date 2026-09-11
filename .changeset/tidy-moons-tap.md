---
"@cloudflare/tanstack-ai": patch
---

Generate unique toolCallIds in the workers-ai adapter's non-streaming fallback path. Workers AI models can return the same deterministic tool_call id for multiple calls in a step; the streaming path already replaces provider ids with generated ones, and the fallback now does the same.
