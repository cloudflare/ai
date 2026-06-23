---
"workers-ai-provider": patch
---

Treat `dynamic/<model>` slugs as Workers AI model ids, not gateway catalog slugs.

AI Gateway dynamic route prefixes (e.g. `dynamic/gemma-4-fallback`) must be
passed through to `env.AI.run()` unmodified so Workers AI can resolve them
through the configured gateway. Previously `createWorkersAI` treated any
`"<provider>/<model>"` id that did not start with `@` as a third-party catalog
slug, so `dynamic/<model>` ids were routed through `createGatewayDelegate`,
which looked up `"dynamic"` in the provider registry, failed to find it, and
threw `Unknown gateway provider "dynamic"`. Slugs starting with `dynamic/` are
now excluded from catalog routing and reach `env.AI.run(model, inputs, { gateway })`
directly, matching the contract of the Workers AI binding.
