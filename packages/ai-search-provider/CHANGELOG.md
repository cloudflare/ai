# ai-search-provider

## 0.1.0

### Minor Changes

- [#602](https://github.com/cloudflare/ai/pull/602) [`2e64811`](https://github.com/cloudflare/ai/commit/2e648116daa6a2e979508157f31274956ffbac26) Thanks [@aninibread](https://github.com/aninibread)! - Add a dedicated AI Search provider for Cloudflare's new AI Search `ai_search_namespaces` Workers binding. Bind a namespace, get an instance by name, then upload files to AI Search for indexing and search that indexed content with natural language or generate chat responses grounded in the retrieved context. `createAISearchNamespace({ binding }).get(instanceName)` returns an instance client exposing an AI SDK model (`chat()`), `search()`, and item helpers (`upload`/`uploadAndPoll`/`list`/`delete`/`get().info()`/`get().download()`); the namespace client also exposes `list()`.
