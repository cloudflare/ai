---
"workers-ai-provider": patch
---

Throw a descriptive error when `binding.run()` resolves without a `Response`.

On some transient upstream failures the Workers AI binding resolves `undefined`
(or a JSON value) instead of rejecting. Both unified-billing run paths (the
gateway-delegate run fetch and the bare `createWorkersAI` run fetch) read
`resp.headers` immediately, so callers crashed with
`TypeError: Cannot read properties of undefined (reading 'get')` — masking the
real failure and defeating AI SDK retry logic. Both sites now validate the
result and throw `Workers AI binding run() for <model> returned <type> instead
of a Response`, which is retryable and reportable.
