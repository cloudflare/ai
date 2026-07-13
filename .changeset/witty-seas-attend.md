---
"workers-ai-provider": major
---

Support the AI SDK v7. Peer dependencies now require `ai@^7`, `@ai-sdk/provider@^4`, and (for the AI Gateway sub-path plugins) `@ai-sdk/openai@^4`, `@ai-sdk/anthropic@^4`, and `@ai-sdk/google@^4`. AI SDK v6 is no longer supported.

The Workers AI models (chat, embeddings, image, transcription, speech, reranking) continue to implement the `*ModelV3` specs, which AI SDK v7 still accepts unchanged, so their behavior is identical. The AI Gateway delegate — which wraps the third-party `@ai-sdk/*` providers routed through Gateway — is migrated from the `LanguageModelV3` spec to `LanguageModelV4` to match those providers on v7. No runtime behavior changes; the delegate remains a pass-through over the underlying provider models.
