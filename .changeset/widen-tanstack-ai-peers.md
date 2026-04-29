---
"@cloudflare/tanstack-ai": patch
---

Widen `@tanstack/ai` peer dependency and optional adapter ranges to accept newer 0.x releases (up to but not including 1.0.0). Previously the caret ranges on pre-1.0 versions resolved to a single minor (e.g. `^0.8.0` only allowed `>=0.8.0 <0.9.0`), causing unmet-peer warnings when consumers installed `@tanstack/ai@0.14.0` and matching adapter versions.
