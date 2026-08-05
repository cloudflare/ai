---
"ai-gateway-provider": patch
"workers-ai-provider": patch
---

Support Azure OpenAI v1 Responses API URLs when routing wrapped models through AI Gateway.

`createAzure(...).responses(...)` with `useDeploymentBasedUrls: false` generates `https://{resource}.openai.azure.com/openai/v1/responses?...` URLs, which the shared provider matcher did not recognize, so wrapped Azure responses models failed with `provider "azure.responses" is currently not supported`. These URLs now route through the `azure-openai` gateway provider as `{resource}/openai/responses...` (Azure's non-deployment Responses route). Deployment-based Azure routing is unchanged, and the match is deliberately scoped to `responses` — other v1 paths (chat, embeddings) have no non-deployment Azure route to map to. Applies to both `ai-gateway-provider`'s wrapped-model routing and `workers-ai-provider`'s `createGatewayProvider` URL detection, which share the matcher.
