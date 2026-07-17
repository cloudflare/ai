# AI Search Provider for AI SDK

Use Cloudflare AI Search as a managed search service from the AI SDK. This provider wraps the AI Search Workers bindings so you can upload files to AI Search for indexing, then search that indexed content with natural language or generate chat responses grounded in the retrieved context.

Bind the `ai_search_namespaces` binding, then get an instance by name:

```jsonc
// wrangler.jsonc
{
	"compatibility_date": "2026-03-27",
	"ai_search_namespaces": [{ "binding": "AI_SEARCH", "namespace": "default" }],
}
```

```ts
import { createAISearchNamespace } from "ai-search-provider";
import { generateText } from "ai";

const aiSearch = createAISearchNamespace({ binding: env.AI_SEARCH });
const docs = aiSearch.get("my-instance"); // synchronous, resolved lazily

const { text } = await generateText({
	model: docs.chat({
		ai_search_options: { retrieval: { max_num_results: 5 } },
	}),
	messages: [{ role: "user", content: "How do I configure caching?" }],
});

const results = await docs.search({ query: "How do I configure caching?" });

await docs.items.upload("guide.md", "# Guide");
```

A `default` namespace is created for every account — bind `ai_search_namespaces` to `default` if you don't need multiple namespaces. `aiSearch.get(name)` is synchronous and resolved lazily; no network call is made until you use the returned instance client. Streaming works the same way — use `streamText` instead of `generateText`.

### Generation options

Standard AI SDK generation options are forwarded to the upstream model configured in your AI Search instance. You can pass `temperature`, `maxOutputTokens`, `topP`, `topK`, `frequencyPenalty`, `presencePenalty`, `stopSequences`, `seed`, and `responseFormat` directly to `generateText` / `streamText`:

```ts
const { text } = await generateText({
	model: docs.chat(),
	messages: [{ role: "user", content: "Summarize the guide" }],
	temperature: 0.3,
	maxOutputTokens: 200,
	topP: 0.9,
});

## API

```ts
const aiSearch = createAISearchNamespace({ binding }); // ai_search_namespaces binding

aiSearch.get(instanceName); // instance client (synchronous, lazy)
aiSearch.list(params?); // list instances in the namespace

// instance client — from aiSearch.get(instanceName):
const instance = aiSearch.get(instanceName);
instance.chat(settings?); // AI SDK model
instance.search(params); // search this instance

instance.items.upload(name, content, options?);
instance.items.uploadAndPoll(name, content, options?); // upload, then poll until indexed
instance.items.list(params?);
instance.items.delete(itemId);
instance.items.get(itemId).info();
instance.items.get(itemId).download();
```

See the [AI Search namespaces docs](https://developers.cloudflare.com/ai-search/concepts/namespaces/) for how namespaces and instances relate.
