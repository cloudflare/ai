# workers-ai-provider

[Workers AI](https://developers.cloudflare.com/workers-ai/) provider for the [AI SDK](https://sdk.vercel.ai/). Run Cloudflare's models for chat, embeddings, image generation, transcription, text-to-speech, reranking, and [AI Search](https://developers.cloudflare.com/ai-search/) — all from a single provider.

## Quick Start

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
			model: workersai("@cf/moonshotai/kimi-k2.5"),
			messages: [{ role: "user", content: "Write a haiku about Cloudflare" }],
		});

		return result.toTextStreamResponse();
	},
};
```

```bash
npm install workers-ai-provider ai
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
| Chat           | `@cf/moonshotai/kimi-k2.5`             | 256k ctx, tools, vision, reasoning  |
| Chat           | `@cf/zai-org/glm-4.7-flash`            | Fast, multilingual, 131k ctx        |
| Chat           | `@cf/openai/gpt-oss-120b`              | OpenAI open-weights, high reasoning |
| Reasoning      | `@cf/moonshotai/kimi-k2.5`             | Configurable `reasoning_effort`     |
| Reasoning      | `@cf/qwen/qwq-32b`                     | Emits `reasoning_content`           |
| Embeddings     | `@cf/baai/bge-base-en-v1.5`            | 768-dim, English                    |
| Embeddings     | `@cf/google/embeddinggemma-300m`       | 100+ languages, by Google           |
| Images         | `@cf/black-forest-labs/flux-1-schnell` | Fast, free-tier image generation    |
| Transcription  | `@cf/openai/whisper-large-v3-turbo`    | Best accuracy, multilingual         |
| Transcription  | `@cf/deepgram/nova-3`                  | Fast, high accuracy                 |
| Text-to-Speech | `@cf/deepgram/aura-2-en`               | Context-aware, natural pacing       |
| Reranking      | `@cf/baai/bge-reranker-base`           | Fast document reranking             |

## Text Generation

```ts
import { generateText } from "ai";

const { text } = await generateText({
	model: workersai("@cf/moonshotai/kimi-k2.5"),
	prompt: "Explain Workers AI in one paragraph",
});
```

Streaming:

```ts
import { streamText } from "ai";

const result = streamText({
	model: workersai("@cf/moonshotai/kimi-k2.5"),
	messages: [{ role: "user", content: "Write a short story" }],
});

for await (const chunk of result.textStream) {
	process.stdout.write(chunk);
}
```

## Vision (Image Inputs)

Send images to vision-capable models like Kimi K2.5:

```ts
import { generateText } from "ai";

const { text } = await generateText({
	model: workersai("@cf/moonshotai/kimi-k2.5"),
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

## Tool Calling

```ts
import { generateText, stepCountIs } from "ai";
import { z } from "zod";

const { text } = await generateText({
	model: workersai("@cf/moonshotai/kimi-k2.5"),
	prompt: "What's the weather in London?",
	tools: {
		getWeather: {
			description: "Get the current weather for a city",
			inputSchema: z.object({ city: z.string() }),
			execute: async ({ city }) => ({ city, temperature: 18, condition: "Cloudy" }),
		},
	},
	stopWhen: stepCountIs(2),
});
```

## Structured Output

```ts
import { generateText, Output } from "ai";
import { z } from "zod";

const { output } = await generateText({
	model: workersai("@cf/moonshotai/kimi-k2.5"),
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

## Image Generation

```ts
import { generateImage } from "ai";

const { images } = await generateImage({
	model: workersai.image("@cf/black-forest-labs/flux-1-schnell"),
	prompt: "A mountain landscape at sunset",
	size: "1024x1024",
});

// images[0].uint8Array contains the PNG bytes
```

## Transcription (Speech-to-Text)

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

## Text-to-Speech

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

## API Reference

### `createWorkersAI(options)`

| Option      | Type             | Description                                                                  |
| ----------- | ---------------- | ---------------------------------------------------------------------------- |
| `binding`   | `Ai`             | Workers AI binding (`env.AI`). Use this OR credentials.                      |
| `accountId` | `string`         | Cloudflare account ID. Required with `apiKey`.                               |
| `apiKey`    | `string`         | Cloudflare API token. Required with `accountId`.                             |
| `gateway`   | `GatewayOptions` | Optional [AI Gateway](https://developers.cloudflare.com/ai-gateway/) config. |

Returns a provider with model factories. Each factory accepts an optional second argument for per-model settings:

```ts
workersai("@cf/moonshotai/kimi-k2.5", {
	sessionAffinity: "my-unique-session-id",
});
```

| Setting           | Type      | Description                                                                                  |
| ----------------- | --------- | -------------------------------------------------------------------------------------------- |
| `safePrompt`      | `boolean` | Inject a safety prompt before all conversations.                                             |
| `sessionAffinity` | `string`  | Routes requests with the same key to the same backend replica for prefix-cache optimization. |

Model factories:

```ts
// Chat — for generateText / streamText
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
