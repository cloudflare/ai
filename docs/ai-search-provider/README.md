# ai-search-provider

AI Search provider for the [Vercel AI SDK](https://sdk.vercel.ai/). Use Cloudflare AI Search as a managed search service from the AI SDK: upload files to AI Search for indexing, then search that indexed content with natural language or generate chat responses grounded in the retrieved context.

- Package README: [`packages/ai-search-provider`](../../packages/ai-search-provider/README.md)
- Cloudflare docs: [AI Search](https://developers.cloudflare.com/ai-search/) · [Namespaces](https://developers.cloudflare.com/ai-search/concepts/namespaces/)

## Quickstart

```jsonc
{
	"compatibility_date": "2026-03-27",
	"ai_search_namespaces": [{ "binding": "AI_SEARCH", "namespace": "default" }],
}
```

```ts
import { createAISearchNamespace } from "ai-search-provider";
import { generateText } from "ai";

const aiSearch = createAISearchNamespace({ binding: env.AI_SEARCH });
const docs = aiSearch.get("docs"); // instance by name (synchronous, lazy)

const { text } = await generateText({
	model: docs.chat({
		ai_search_options: { retrieval: { max_num_results: 5 } },
	}),
	messages: [{ role: "user", content: "How do I configure caching?" }],
});
```

For search and document management:

```ts
const results = await docs.search({ query: "How do I configure caching?" });

await docs.items.upload("guide.md", "# Guide");
```
