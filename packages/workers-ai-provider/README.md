# workers-ai-provider

[Workers AI](https://developers.cloudflare.com/workers-ai/) provider for the [AI SDK](https://sdk.vercel.ai/). Run Cloudflare's models for chat, embeddings, image generation, transcription, text-to-speech, reranking, and [AI Search](https://developers.cloudflare.com/ai-search/) — all from a single provider. It can also route **third-party** models (OpenAI, Anthropic, Google, …) through [AI Gateway](https://developers.cloudflare.com/ai-gateway/) — see [Third-party models](#third-party-models-via-ai-gateway).

> 📚 In-depth guides and the AI Gateway **delegate** reference (unified catalog,
> resumable streaming _(coming soon)_, server-side fallback) live in
> [`docs/workers-ai-provider`](../../docs/workers-ai-provider/README.md).

## Quick start

```bash
npm install workers-ai-provider ai
```

```jsonc
// wrangler.jsonc
{
	"ai": { "binding": "AI" },
}
```

```ts
import { createWorkersAI } from "workers-ai-provider";
import { streamText } from "ai";

export default {
	async fetch(req: Request, env: { AI: Ai }) {
		const workersai = createWorkersAI({ binding: env.AI });

		const result = streamText({
			model: workersai("@cf/moonshotai/kimi-k2.7-code"),
			messages: [{ role: "user", content: "Write a haiku about Cloudflare" }],
		});

		return result.toTextStreamResponse();
	},
};
```

## Configuration

### Workers binding (recommended)

Inside a Cloudflare Worker, pass the `env.AI` binding directly. No API keys needed.

```ts
const workersai = createWorkersAI({ binding: env.AI });
```

### REST API

Outside of Workers (Node.js, Bun, etc.), use your Cloudflare credentials:

```ts
const workersai = createWorkersAI({
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	apiKey: process.env.CLOUDFLARE_API_TOKEN,
});
```

### AI Gateway

Route requests through [AI Gateway](https://developers.cloudflare.com/ai-gateway/) for caching, rate limiting, and observability:

```ts
const workersai = createWorkersAI({
	binding: env.AI,
	gateway: { id: "my-gateway" },
});
```

## Models

Browse the full catalog at [developers.cloudflare.com/workers-ai/models](https://developers.cloudflare.com/workers-ai/models/).

Some good defaults:

| Task           | Model                                  | Notes                               |
| -------------- | -------------------------------------- | ----------------------------------- |
| Chat           | `@cf/moonshotai/kimi-k2.7-code`        | 256k ctx, tools, vision, reasoning  |
| Chat           | `@cf/zai-org/glm-4.7-flash`            | Fast, multilingual, 131k ctx        |
| Chat           | `@cf/openai/gpt-oss-120b`              | OpenAI open-weights, high reasoning |
| Reasoning      | `@cf/moonshotai/kimi-k2.7-code`        | Configurable `reasoning_effort`     |
| Reasoning      | `@cf/qwen/qwq-32b`                     | Emits `reasoning_content`           |
| Embeddings     | `@cf/baai/bge-base-en-v1.5`            | 768-dim, English                    |
| Embeddings     | `@cf/google/embeddinggemma-300m`       | 100+ languages, by Google           |
| Images         | `@cf/black-forest-labs/flux-1-schnell` | Fast, free-tier image generation    |
| Transcription  | `@cf/openai/whisper-large-v3-turbo`    | Best accuracy, multilingual         |
| Transcription  | `@cf/deepgram/nova-3`                  | Fast, high accuracy                 |
| Text-to-Speech | `@cf/deepgram/aura-2-en`               | Context-aware, natural pacing       |
| Reranking      | `@cf/baai/bge-reranker-base`           | Fast document reranking             |

## Text generation

```ts
import { generateText } from "ai";

const { text } = await generateText({
	model: workersai("@cf/moonshotai/kimi-k2.7-code"),
	prompt: "Explain Workers AI in one paragraph",
});
```

Streaming:

```ts
import { streamText } from "ai";

const result = streamText({
	model: workersai("@cf/moonshotai/kimi-k2.7-code"),
	messages: [{ role: "user", content: "Write a short story" }],
});

for await (const chunk of result.textStream) {
	process.stdout.write(chunk);
}
```

## Reasoning controls

Reasoning-capable Workers AI models (GLM-4.7-flash, Kimi K2.5/K2.6, GPT-OSS, QwQ) accept `reasoning_effort` and `chat_template_kwargs` on their inputs. Either set them at model creation time as settings, or per-call via `providerOptions["workers-ai"]` (per-call wins):

```ts
// Settings-level (applies to every request on this model instance)
const model = workersai("@cf/zai-org/glm-4.7-flash", {
	reasoning_effort: "low", // "low" | "medium" | "high" | null
	chat_template_kwargs: { enable_thinking: false },
});

await generateText({ model, prompt: "Summarize in one sentence." });
```

```ts
// Per-call (overrides any settings-level value)
const model = workersai("@cf/zai-org/glm-4.7-flash");

await generateText({
	model,
	prompt: "Summarize in one sentence.",
	providerOptions: {
		"workers-ai": { reasoning_effort: "low" },
	},
});
```

`reasoning_effort: null` is meaningful — it's the explicit "disable reasoning" signal for models that support it. Both fields land on the `inputs` object of `binding.run()` (and the JSON body of the REST request), matching the shape expected by Workers AI. See the [model catalog](https://developers.cloudflare.com/workers-ai/models/) for per-model reasoning capabilities.

## Vision (image inputs)

Send images to vision-capable models like Kimi K2.5:

```ts
import { generateText } from "ai";

const { text } = await generateText({
	model: workersai("@cf/moonshotai/kimi-k2.7-code"),
	messages: [
		{
			role: "user",
			content: [
				{ type: "text", text: "What's in this image?" },
				{ type: "image", image: imageUint8Array },
			],
		},
	],
});
```

Images can be provided as `Uint8Array`, base64 strings, or data URLs. Multiple images per message are supported. Works with both the binding and REST API configurations.

## Tool calling

```ts
import { generateText, isStepCount } from "ai";
import { z } from "zod";

const { text } = await generateText({
	model: workersai("@cf/moonshotai/kimi-k2.7-code"),
	prompt: "What's the weather in London?",
	tools: {
		getWeather: {
			description: "Get the current weather for a city",
			inputSchema: z.object({ city: z.string() }),
			execute: async ({ city }) => ({ city, temperature: 18, condition: "Cloudy" }),
		},
	},
	stopWhen: isStepCount(2),
});
```

## Structured output

```ts
import { generateText, Output } from "ai";
import { z } from "zod";

const { output } = await generateText({
	model: workersai("@cf/moonshotai/kimi-k2.7-code"),
	prompt: "Recipe for spaghetti bolognese",
	output: Output.object({
		schema: z.object({
			name: z.string(),
			ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
			steps: z.array(z.string()),
		}),
	}),
});
```

## Embeddings

```ts
import { embedMany } from "ai";

const { embeddings } = await embedMany({
	model: workersai.textEmbedding("@cf/baai/bge-base-en-v1.5"),
	values: ["sunny day at the beach", "rainy afternoon in the city"],
});
```

## Image generation

```ts
import { generateImage } from "ai";

const { images } = await generateImage({
	model: workersai.image("@cf/black-forest-labs/flux-1-schnell"),
	prompt: "A mountain landscape at sunset",
	size: "1024x1024",
});

// images[0].uint8Array contains the PNG bytes
```

## Transcription (speech-to-text)

Transcribe audio using Whisper or Deepgram Nova-3 models.

```ts
import { transcribe } from "ai";
import { readFile } from "node:fs/promises";

const { text, segments } = await transcribe({
	model: workersai.transcription("@cf/openai/whisper-large-v3-turbo"),
	audio: await readFile("./audio.mp3"),
	mediaType: "audio/mpeg",
});
```

With language hints (Whisper only):

```ts
const { text } = await transcribe({
	model: workersai.transcription("@cf/openai/whisper-large-v3-turbo", {
		language: "fr",
	}),
	audio: audioBuffer,
	mediaType: "audio/wav",
});
```

Deepgram Nova-3 is also supported and detects language automatically:

```ts
const { text } = await transcribe({
	model: workersai.transcription("@cf/deepgram/nova-3"),
	audio: audioBuffer,
	mediaType: "audio/wav",
});
```

## Text-to-speech

Generate spoken audio from text using Deepgram Aura-2.

```ts
import { speech } from "ai";

const { audio } = await speech({
	model: workersai.speech("@cf/deepgram/aura-2-en"),
	text: "Hello from Cloudflare Workers AI!",
	voice: "asteria",
});

// audio is a Uint8Array of MP3 bytes
```

## Reranking

Reorder documents by relevance to a query — useful for RAG pipelines.

```ts
import { rerank } from "ai";

const { results } = await rerank({
	model: workersai.reranking("@cf/baai/bge-reranker-base"),
	query: "What is Cloudflare Workers?",
	documents: [
		"Cloudflare Workers lets you run JavaScript at the edge.",
		"A cookie is a small piece of data stored in the browser.",
		"Workers AI runs inference on Cloudflare's global network.",
	],
	topN: 2,
});

// results is sorted by relevance score
```

## AI Search

[AI Search](https://developers.cloudflare.com/ai-search/) is Cloudflare's managed RAG service. Connect your data and query it with natural language.

> For Cloudflare's new `ai_search_namespaces` Workers binding — upload files to AI Search for indexing, then search or chat over them — use the dedicated [`ai-search-provider`](../ai-search-provider/README.md) package. The `createAISearch` shown here wraps the legacy `AutoRAG` binding.

```jsonc
// wrangler.jsonc
{
	"ai_search": [{ "binding": "AI_SEARCH", "name": "my-search-index" }],
}
```

```ts
import { createAISearch } from "workers-ai-provider";
import { generateText } from "ai";

const aisearch = createAISearch({ binding: env.AI_SEARCH });

const { text } = await generateText({
	model: aisearch(),
	messages: [{ role: "user", content: "How do I setup AI Gateway?" }],
});
```

Streaming works the same way — use `streamText` instead of `generateText`.

> `createAutoRAG` still works but is deprecated. Use `createAISearch` instead.

## Third-party models via AI Gateway

> **⚠️ Experimental.** Everything in this section (routing third-party models via `createWorkersAI({ providers })`, the provider plugins, the registry, the resume layer, and `createGatewayFetch`/`createGatewayProvider`) is a new and substantial addition — well beyond the package's original job of wrapping Workers AI. Treat the whole surface as experimental: APIs may change, and several behaviors depend on undocumented AI Gateway internals (the `cf-aig-run-id` resume buffer, per-provider run-path wire formats). It does **not** affect the stable Workers AI / AI Search APIs above. Bug reports and feedback are very welcome.

Route **third-party** catalog models — OpenAI, Anthropic, Google, xAI/Grok, Groq, and the OpenAI-compatible long tail — through [AI Gateway](https://developers.cloudflare.com/ai-gateway/) using the same `env.AI` binding, with resumable streaming _(coming soon)_, BYOK, caching, and fallback.

Install only the wire-format plugins you actually use. They're **optional** peer dependencies:

```bash
npm install @ai-sdk/openai      # openai, deepseek, xai/grok, groq, mistral, perplexity, cerebras, openrouter, fireworks, alibaba, minimax
npm install @ai-sdk/anthropic   # anthropic
npm install @ai-sdk/google      # google, google-vertex
```

### Setup

Pass the plugins to `createWorkersAI` via `providers`. Then it's the same provider you already use: `@cf/...` ids build Workers AI models, and a `"<provider>/<model>"` catalog slug is routed through AI Gateway automatically. `createWorkersAI` is the single public entry point — there's no separate factory to import.

```ts
import { createWorkersAI } from "workers-ai-provider";
import { openai } from "workers-ai-provider/openai";
import { anthropic } from "workers-ai-provider/anthropic";
import { streamText } from "ai";

const workersai = createWorkersAI({
	binding: env.AI,
	providers: [openai, anthropic], // opt-in; enables third-party routing
	// gateway is optional — catalog routing uses your account's "default"
	// gateway unless you set one, e.g. gateway: { id: "my-gateway" }.
});

workersai("@cf/zai-org/glm-5.2"); // Workers AI (unchanged)

const result = streamText({
	model: workersai("openai/gpt-5", { resume: true }), // routed through AI Gateway
	prompt: "Hello",
});
// result.response.headers["cf-aig-run-id"] is set — resume from there.
```

The settings argument is **typed from the model id**: pass a `"<provider>/<model>"` catalog slug and the second argument autocompletes the per-call gateway options (`resume`, `fallback`, `cacheTtl`, `byok`, `metadata`, …, i.e. `DelegateCallOptions`); pass a `@cf/...` id and it autocompletes the usual `WorkersAIChatSettings`. `providers` is optional and **additive**: leave it unset and `createWorkersAI` behaves exactly as before — `@cf/...` ids work as always, and a `"<provider>/<model>"` catalog slug still routes through the unified-billing run path (defaulting to your account's `"default"` gateway, with the built-in OpenAI-compatible parser). Configure `providers` to unlock higher-fidelity parsing plus the per-call delegate options (BYOK, caching, fallback, resume); requesting one of those without `providers` throws a helpful error pointing you here.

`gateway` is optional for catalog routing — when unset, requests use your account's `"default"` AI Gateway. Set `gateway: { id: "…" }` (here or per call) to use a specific gateway.

The examples below assume a `workersai` configured with `providers` as above.

### Wire-format plugins and provider coverage

One plugin per **wire format** serves every provider of that format. The `openai` plugin alone covers `openai/…`, `deepseek/…`, `xai/…` (alias `grok`), `groq/…`, `mistral/…`, `perplexity/…`, `cerebras/…`, `openrouter/…`, `fireworks/…`, plus the unified-catalog chat providers `alibaba/…` (Qwen) and `minimax/…`.

The registry covers every provider in the [AI Gateway provider directory](https://developers.cloudflare.com/ai-gateway/usage/providers/) — OpenAI, Anthropic, Google AI Studio, Google Vertex AI, xAI/Grok, Groq, DeepSeek, Mistral, Perplexity, Cerebras, OpenRouter, Cohere, Baseten, Parallel, Azure OpenAI, Amazon Bedrock, HuggingFace, Replicate, Fal, Ideogram, Cartesia, Deepgram, ElevenLabs (plus Fireworks) — so `createGatewayFetch` can auto-detect them from the request URL.

**Coverage maturity varies** (the whole feature is experimental). Only the unified-billing run-catalog providers — OpenAI, Anthropic, Google, xAI/Grok, Groq, DeepSeek, Alibaba/Qwen, MiniMax — are exercised end-to-end against a live gateway. The remaining registry entries (BYOK gateway-path providers like Mistral/Perplexity/Cerebras/OpenRouter/Fireworks, and bring-your-own-provider-only ones like Cohere/Baseten/Parallel/Azure OpenAI/Bedrock/HuggingFace/Replicate/Fal/Ideogram/Cartesia/Deepgram/ElevenLabs) are registry-level wiring (gateway id, host pattern, endpoint transform) that is **not yet live-verified** — the routing is in place, but a provider's exact request shape may need adjustment. Please file issues for any that misbehave.

> **Run-path wire format is per-provider — not always OpenAI.** On the resumable run path (`env.AI.run`), Cloudflare's unified catalog **normalizes most providers to OpenAI chat-completions** (so `google/…` is parsed with the `openai` plugin on the run path, even though the gateway path uses the native `google` plugin), but **passes Anthropic through natively** — so `anthropic/…` uses the `anthropic` plugin on both paths. In practice: include `openai` for the openai-wire run-path providers (openai, google, xai/grok, groq), and `anthropic` to use `anthropic/…`. The native `google` plugin is only needed if you force google onto the **gateway path**. If a plugin a transport needs is missing, the delegate throws a `GatewayDelegateError` naming it.

### Transports

The transport is chosen automatically from the options you pass:

| Transport         | Backed by                    | Resume _(coming soon)_ (`cf-aig-run-id`) | Caching | Server fallback | Billing           |
| ----------------- | ---------------------------- | ---------------------------------------- | ------- | --------------- | ----------------- |
| **run** (default) | `env.AI.run(...)`            | ✅                                       | ❌      | ❌              | Unified billing   |
| **gateway**       | `env.AI.gateway(id).run([])` | ❌                                       | ✅      | ✅              | BYOK / stored key |

Run-catalog providers (OpenAI, Anthropic, Google, xAI, Groq, DeepSeek, plus the unified-catalog chat providers Alibaba/Qwen and MiniMax) default to the resumable **run path**. BYOK-only providers (mistral, perplexity, cerebras, …) always use the **gateway path**. Asking for an impossible combination (e.g. `resume: true` with `fallback.mode: "server"`) throws a `GatewayDelegateError`.

> Alibaba and MiniMax are **run-path only** — they're on the unified catalog but not the native gateway directory, so there's no gateway path. Requesting `transport: "gateway"`, caching, or server-side fallback on them throws a clear `GatewayDelegateError` at build time (rather than failing upstream); use the default run path or `fallback.mode: "client"`.

### BYOK (bring your own key)

Set `byok: true` to forward your own upstream key via `extraHeaders`. BYOK is a gateway-path feature, so it forces the gateway path even for a run-catalog provider like DeepSeek (resume isn't available on that leg):

```ts
streamText({
	model: workersai("deepseek/deepseek-chat", {
		byok: true,
		extraHeaders: { authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
	}),
	prompt: "Hello",
});
```

Without `byok`, provider auth headers are stripped so unified billing / the gateway's stored key applies.

### Fallback

```ts
// Client-side: keeps resume per leg. A failed pre-stream dispatch falls through.
workersai("openai/gpt-5", {
	fallback: { mode: "client", models: ["anthropic/claude-sonnet-4-5"] },
});

// Server-side: same-vendor, on the gateway path.
workersai("openai/gpt-5", { fallback: { mode: "server", models: ["openai/gpt-5-mini"] } });
```

If every client-side leg fails, a `WorkersAIFallbackError` carries the per-attempt tree.

### Caching

```ts
workersai("openai/gpt-5", { cacheTtl: 3600 }); // gateway path; cacheTtl/skipCache force it
```

### Metadata & logging

Attach custom metadata (for spend attribution, tenant breakdowns, etc.) and toggle gateway log collection per request. Both work on either transport — on the run path they go into the typed gateway options; on the gateway path they become `cf-aig-metadata` / `cf-aig-collect-log` headers. Call-level `metadata` merges over (and wins against) any `metadata` set via `gateway: { metadata }`.

```ts
workersai("openai/gpt-5", {
	metadata: { teamId: "AI", userId: 12345 }, // breaks down spend in the dashboard
	collectLog: false, // opt this request out of log collection
});
```

### Resume after disconnect

> **🚧 Coming soon.** Resumable streaming is not generally available yet — the AI
> Gateway resume backend is still rolling out. The options here are in place so
> you can adopt them early, but treat resume as experimental until the rollout
> completes.

The run path wraps the response stream so a transient mid-stream drop reconnects through the gateway resume endpoint transparently. For cross-invocation recovery (e.g. a Durable Object re-attaching after eviction), persist `{ runId, eventOffset }` via `onDispatch` + `onProgress` and re-attach with `createResumableStream`:

```ts
workersai("openai/gpt-5", {
	onDispatch: (info) => save({ runId: info.runId }),
	onProgress: (eventOffset) => save({ eventOffset }), // throttle your own writes
	onResumeExpired: "accept-partial", // or "error" (default) once the ~5.5 min buffer TTL elapses
});
```

### Bring your own provider

For provider-native or non-chat providers the slug delegate can't auto-wire (bedrock, replicate, audio/image), or for full control, route any `@ai-sdk/*` provider through the gateway:

```ts
import { createOpenAI } from "@ai-sdk/openai";
import { createGatewayFetch } from "workers-ai-provider/gateway";

const openai = createOpenAI({
	apiKey: env.OPENAI_API_KEY, // forwarded when byok: true
	fetch: createGatewayFetch({ binding: env.AI, gateway: "my-gateway", byok: true }),
});
const model = openai("gpt-5");
```

The provider id is detected from the request URL (or pass `provider` explicitly).

### Errors

`WorkersAIGatewayError` carries a coarse `code` (`auth`, `rate-limit`, `not-found`, `bad-request`, `provider-error`, `gateway-error`, `resume-expired`), a `recoverable` hint, the HTTP `status`, and the parsed CF/provider envelope. `WorkersAIFallbackError` carries the `attempts` tree.

## API reference

### `createWorkersAI(options)`

| Option            | Type                            | Description                                                                                                  |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `binding`         | `Ai`                            | Workers AI binding (`env.AI`). Use this OR credentials.                                                      |
| `accountId`       | `string`                        | Cloudflare account ID. Required with `apiKey`.                                                               |
| `apiKey`          | `string`                        | Cloudflare API token. Required with `accountId`.                                                             |
| `gateway`         | `GatewayOptions`                | Optional [AI Gateway](https://developers.cloudflare.com/ai-gateway/) config.                                 |
| `providers`       | `ProviderPlugin[]`              | _Experimental._ Wire-format plugins that enable routing `"<provider>/<model>"` slugs via gateway.            |
| `resume`          | `boolean`                       | _Experimental — coming soon._ Default resume behavior for gateway-routed catalog models. Defaults to `true`. |
| `onResumeExpired` | `"error"` \| `"accept-partial"` | _Experimental — coming soon._ Default policy when the gateway resume buffer expires. Defaults to `"error"`.  |

Returns a provider with model factories. Each factory accepts an optional second argument for per-model settings:

```ts
workersai("@cf/moonshotai/kimi-k2.7-code", {
	sessionAffinity: "my-unique-session-id",
});
```

| Setting           | Type      | Description                                                                                  |
| ----------------- | --------- | -------------------------------------------------------------------------------------------- |
| `safePrompt`      | `boolean` | Inject a safety prompt before all conversations.                                             |
| `sessionAffinity` | `string`  | Routes requests with the same key to the same backend replica for prefix-cache optimization. |

Model factories:

```ts
// Chat — for generateText / streamText (also accepts third-party slugs when `providers` is set)
workersai(modelId);
workersai.chat(modelId);

// Embeddings — for embedMany / embed
workersai.textEmbedding(modelId);

// Images — for generateImage
workersai.image(modelId);

// Transcription — for transcribe
workersai.transcription(modelId, settings?);

// Text-to-Speech — for speech
workersai.speech(modelId);

// Reranking — for rerank
workersai.reranking(modelId);
```

### `createAISearch(options)`

| Option    | Type      | Description                          |
| --------- | --------- | ------------------------------------ |
| `binding` | `AutoRAG` | AI Search binding (`env.AI_SEARCH`). |

Returns a callable provider:

```ts
aisearch(); // AI Search model (shorthand)
aisearch.chat(); // AI Search model
```
