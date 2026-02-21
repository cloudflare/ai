---
"ai-gateway-provider": minor
---

Add embedding model support to AI Gateway provider.

This allows users to route embedding requests through AI Gateway, enabling:
- Caching for embeddings via `cacheTtl` and `cacheKey` options
- Request logging via `collectLog` option
- Retry configuration via `retries` option
- Metadata tracking via `metadata` option

Usage:
```typescript
import { createAiGateway } from "ai-gateway-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

const aigateway = createAiGateway({
  accountId: "your-account-id",
  apiKey: "your-api-key",
  gateway: "your-gateway",
});

const openai = createOpenAI({ apiKey: "your-openai-key" });

const result = await embed({
  model: aigateway.embedding(openai.embedding("text-embedding-3-small")),
  value: "Hello, world!",
});
```

New methods on the AI Gateway provider:
- `embedding()` - Create an embedding model routed through AI Gateway
- `textEmbedding()` - Alias for `embedding()`
- `textEmbeddingModel()` - Alias for `embedding()`
