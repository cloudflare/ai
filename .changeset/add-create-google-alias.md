---
"ai-gateway-provider": patch
---

Add `createGoogle` as an alias for `createGoogleGenerativeAI` in the Google provider. This fixes the mismatch between the Cloudflare dashboard example (which uses `createGoogle()`) and the package export. Both names now work interchangeably.
