# Binding vs REST

Both `workers-ai-provider` and `@cloudflare/tanstack-ai` can reach Workers AI and
AI Gateway two ways: through the **`env.AI` binding** or through the **REST API**.

## The `env.AI` binding

```ts
// wrangler.jsonc binds Workers AI as env.AI
const provider = createWorkersAI({ binding: env.AI });
```

- Runs inside a Cloudflare Worker.
- Authenticates with the Worker's account automatically — no API token in code.
- The only transport that supports **resumable streaming** _(coming soon)_ — the
  run path emits `cf-aig-run-id`; see [resume](./resume.md).
- Access to the gateway universal endpoint via `env.AI.gateway(id).run([...])`.

## The REST API

```ts
const provider = createWorkersAI({
	accountId: "<account-id>",
	apiKey: "<token>", // or gateway credentials
});
```

- Runs anywhere (Node, edge, browser-adjacent backends, CI).
- Authenticates with an explicit API token.
- **No resume** — there is no binding to re-attach a run id to.

## What each transport supports

| Capability                                        | Binding | REST |
| ------------------------------------------------- | ------- | ---- |
| Chat / generate / stream                          | ✅      | ✅   |
| Image / embeddings / transcription / TTS / rerank | ✅      | ✅   |
| Gateway routing (caching, metadata)               | ✅      | ✅   |
| BYOK stored-key alias (`cf-aig-byok-alias`)       | ❌      | ✅   |
| Server-side fallback                              | ✅      | ✅   |
| **Resumable streaming** _(coming soon)_           | ✅      | ❌   |

## Choosing

- Inside a Worker, prefer the **binding** — it's keyless and unlocks resume.
- Outside a Worker (scripts, servers, CI), use **REST** with a scoped token.

Both packages auto-detect the mode from the config you pass (`binding` vs
`accountId`/`apiKey`), so the rest of your code is identical. The examples in
[`examples/workers-ai`](../../examples/workers-ai/) and
[`examples/tanstack-ai`](../../examples/tanstack-ai/) demonstrate both modes
behind a toggle.
