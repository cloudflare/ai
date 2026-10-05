# workers-ai-provider

Workers AI provider for the [Vercel AI SDK](https://sdk.vercel.ai/). Run Workers
AI models, and route any catalog model through AI Gateway with unified billing,
server-side fallback, and resumable streaming _(coming soon)_.

- Package README (quickstart): [`packages/workers-ai-provider`](../../packages/workers-ai-provider/README.md)
- Concepts: [gateway routing](../concepts/gateway-routing.md) ·
  [resume](../concepts/resume.md) _(coming soon)_ · [binding vs REST](../concepts/binding-vs-rest.md)

> **🚧 Resumable streaming is coming soon.** It's not generally available yet —
> the AI Gateway resume backend is still rolling out. The `resume` /
> `onResumeExpired` options below are in place so you can adopt them early, but
> treat resume as experimental until the rollout completes.

## Three entry points

### 1. Workers AI models — `createWorkersAI`

```ts
import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";

const workersai = createWorkersAI({ binding: env.AI });

const { text } = await generateText({
	model: workersai("@cf/zai-org/glm-5.2"),
	prompt: "Write a haiku about Cloudflare Workers.",
});
```

Supports chat (tool calling, reasoning), image generation, embeddings,
transcription, text-to-speech, reranking, and evaluation. Works with a `binding` or with
`accountId` + `apiKey` (REST).

### 2. Bring your own `@ai-sdk` provider — `createGatewayProvider`

Wrap any `@ai-sdk/*` provider so its requests are routed through your gateway
(host-stripped to the gateway-native endpoint, with `cf-aig-*` headers applied).
Useful for provider-native or non-chat providers the slug delegate can't
auto-wire, or when you want full control over the model instance.

```ts
import { createGatewayProvider } from "workers-ai-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const openai = createGatewayProvider(createOpenAI, {
	binding: env.AI,
	gateway: "my-gateway",
	byok: true, // forward the provider key; omit to use unified billing / a stored key
	apiKey: env.OPENAI_API_KEY,
});

const { text } = await generateText({ model: openai("gpt-5"), prompt: "Hello" });
```

The provider id is detected from the request URL. Outside a Worker, the lower-level
`createGatewayFetch` from `workers-ai-provider/gateway` does the same with explicit
credentials.

### 3. The AI Gateway delegate — catalog slug routing

Configure `createWorkersAI` with provider plugins, then pass a `vendor/model`
slug (instead of a `@cf/...` id) to route it through AI Gateway with
capability-driven transport selection (run path vs gateway path), resume,
caching, and fallback.

```ts
import { createWorkersAI } from "workers-ai-provider";
import { openai } from "workers-ai-provider/openai";
import { anthropic } from "workers-ai-provider/anthropic";

const gatewayAi = createWorkersAI({
	binding: env.AI,
	gateway: { id: "my-gateway" },
	providers: [openai, anthropic],
});

// Run path + resume (default for unified-catalog providers):
const model = gatewayAi("openai/gpt-5");

// Cross-vendor server-side fallback (one gateway run, cf-aig-step picks winner):
const resilient = gatewayAi("openai/gpt-5", {
	fallback: { mode: "server", models: ["anthropic/claude-sonnet-4-5"] },
});
```

Provider plugins are imported from sub-paths so the `@ai-sdk/*` packages stay
optional peers: `workers-ai-provider/openai`, `/anthropic`, `/google`. One plugin
covers a whole wire format — the `openai` plugin serves the entire
OpenAI-compatible long tail. A `@cf/...` id on the same provider still routes to
Workers AI directly, so one provider instance handles both.

## Delegate call options

| Option                   | Effect                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `resume`                 | _(Coming soon)_ Resumable streaming on the run path (default `true`).                                                     |
| `onResumeExpired`        | _(Coming soon)_ `"error"` (default) or `"accept-partial"` on resume-buffer eviction.                                      |
| `fallback`               | `{ mode: "client" \| "server", models: string[] }`. `client` keeps resume per leg; `server` uses the gateway path.        |
| `cacheTtl` / `skipCache` | Gateway response caching (forces the gateway path).                                                                       |
| `transport`              | Force `"run"` or `"gateway"`.                                                                                             |
| `gateway`                | Override the delegate's gateway for this call (`id` or full options).                                                     |
| `metadata`               | Custom gateway-log metadata (merged over `gateway.metadata`; `bigint` coerced to string).                                 |
| `collectLog`             | Force gateway log collection on/off.                                                                                      |
| `byok`                   | Forward the upstream provider key (BYOK) instead of stripping it.                                                         |
| `extraHeaders`           | Extra request headers.                                                                                                    |
| `onDispatch`             | Called once per dispatch with the resolved transport + gateway headers (incl. `runId`, `cfStep`, `cacheStatus`, `logId`). |
| `onProgress`             | Run path: fired with the cumulative SSE event offset as resume advances.                                                  |

See [gateway routing](../concepts/gateway-routing.md) for how `transport`,
`fallback`, and `cacheTtl` interact with transport selection.

## Complete Worker example

A single `fetch` handler that streams a resilient, resumable response. Workers AI
models and catalog slugs share the same provider instance.

```ts
import { createWorkersAI } from "workers-ai-provider";
import { openai } from "workers-ai-provider/openai";
import { anthropic } from "workers-ai-provider/anthropic";
import { streamText } from "ai";

export default {
	async fetch(req: Request, env: { AI: Ai }) {
		const workersai = createWorkersAI({
			binding: env.AI,
			providers: [openai, anthropic],
			gateway: { id: "my-gateway" },
		});

		const { prompt } = (await req.json()) as { prompt: string };

		const result = streamText({
			// Run path + resume by default; client-side fallback keeps resume per leg.
			model: workersai("openai/gpt-5", {
				fallback: { mode: "client", models: ["anthropic/claude-sonnet-4-5"] },
				onResumeExpired: "accept-partial",
			}),
			prompt,
		});

		return result.toTextStreamResponse();
	},
};
```

## Exports

- `createWorkersAI` (catalog slug routing is enabled by passing `providers`),
  `createGatewayProvider`
- `GATEWAY_PROVIDERS`, `findProviderBySlug`, `detectProviderByUrl`,
  `wireableProviders` (the shared registry)
- `createResumableStream`, `GatewayDelegateError`, `WorkersAIGatewayError`,
  `WorkersAIFallbackError`, `createClientFallbackModel`
- `DelegateCallOptions`, `ProviderPlugin`, `Transport`, `WireFormat` (types)
- Provider plugins from `workers-ai-provider/{openai,anthropic,google}`

## Error matching across packages

The shared core is bundled into each consumer, so shared error **classes** are
distinct per bundle — cross-package `instanceof` would fail. Match shared errors
by `.name` / a `kind` discriminant rather than `instanceof`. Catching the error
class exported by this package (single bundle) works fine.
