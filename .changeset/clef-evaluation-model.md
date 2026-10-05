---
"workers-ai-provider": minor
---

Add evaluation model support for Clef (`@cf/cloudflare/clef`, `@cf/cloudflare/clef-flash`) via `workersai.evaluation(modelId)`, implementing the AI SDK's experimental `EvaluationModelV4` interface for use with `experimental_evaluate`. Maps the AI SDK's `boolean` questions to Clef's `noul` type, forwards images via `providerOptions["workers-ai"].images`, and exposes per-answer `confidence` and score `legend` in provider metadata. Requires `ai@7.0.103` or later.
