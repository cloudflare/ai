---
"@cloudflare/tanstack-ai": patch
---

Add config validation to all Workers AI adapter constructors that throws a clear error when neither a binding, credentials (accountId + apiKey), nor a gateway configuration is provided. Widen all model type parameters (WorkersAiTextModel, WorkersAiImageModel, WorkersAiEmbeddingModel, WorkersAiTranscriptionModel, WorkersAiTTSModel, WorkersAiSummarizeModel) to accept arbitrary strings while preserving autocomplete for known models.
