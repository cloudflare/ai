---
"workers-ai-provider": patch
---

Add early config validation to `createWorkersAI` that throws a clear error when neither a binding nor credentials (accountId + apiKey) are provided. Widen all model type parameters (TextGenerationModels, ImageGenerationModels, EmbeddingModels, TranscriptionModels, SpeechModels, RerankingModels) to accept arbitrary strings while preserving autocomplete for known models.
