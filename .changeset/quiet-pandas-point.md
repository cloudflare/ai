---
"workers-ai-provider": patch
---

Docs: point AI Search users to the new dedicated `ai-search-provider` package for Cloudflare's new `ai_search` and `ai_search_namespaces` Workers bindings. `createAISearch` and `createAutoRAG` in this package continue to wrap the legacy `AutoRAG` binding, unchanged.
