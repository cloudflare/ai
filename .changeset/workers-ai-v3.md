---
"workers-ai-provider": major
---

Upgrade to AI SDK V3 specification

## Breaking Changes

- `specificationVersion` changed from `"v2"` to `"v3"`
- Updated `@ai-sdk/provider` to `^3.0.0`
- All `LanguageModelV2` types replaced with `LanguageModelV3`
- `LanguageModelV3FinishReason` now returns `{ unified, raw }` object instead of string
- `LanguageModelV3Usage` now uses nested `inputTokens` and `outputTokens` objects
- `EmbeddingModelV3` is no longer generic
- Warning types changed to `SharedV3Warning` with `feature` instead of `setting`

## Migration

This package now requires AI SDK v6. Update your `ai` dependency:

```bash
npm install ai@^6.0.0
```

No API changes are needed - the package maintains the same public interface.
