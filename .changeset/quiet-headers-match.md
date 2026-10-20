---
"ai-gateway-provider": patch
---

Strip the injected temporary auth token even when the wrapped SDK sets the auth header with different casing (for example `Authorization`) on a plain-object headers bag.
