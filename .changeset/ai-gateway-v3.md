---
"ai-gateway-provider": major
---

Upgrade to AI SDK V3 specification

## Breaking Changes

- `specificationVersion` changed from `"v2"` to `"v3"`
- Updated `@ai-sdk/provider` to `^3.0.0`
- Updated `ai` to `^6.0.0`
- All `LanguageModelV2` types replaced with `LanguageModelV3`

## Migration

This package now requires AI SDK v6. Update your `ai` dependency:

```bash
npm install ai@^6.0.0
```

No API changes are needed - the package maintains the same public interface.
