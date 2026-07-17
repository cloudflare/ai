/**
 * E2E fixture worker for ai-search-provider.
 *
 * Exercises the provider against a REAL `ai_search_namespaces` binding so we can
 * confirm the (experimental) instance + items binding methods behave end to end.
 * The instance name is supplied per-request in the JSON body (`instance`).
 */
import { generateText, streamText } from "ai";
import { createAISearchNamespace } from "../../../../../src/index";

interface Env {
	AI_SEARCH?: AiSearchNamespace;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return json({ ok: true });
		}

		if (!env.AI_SEARCH) {
			return json({ skipped: true, reason: "AI_SEARCH binding not configured" });
		}

		let body: Record<string, unknown> = {};
		try {
			body = (await request.json()) as Record<string, unknown>;
		} catch {
			body = {};
		}

		const instanceName = typeof body.instance === "string" ? body.instance : "";
		if (!instanceName) {
			return json({ error: "missing 'instance' in request body" }, 400);
		}

		const aiSearch = createAISearchNamespace({ binding: env.AI_SEARCH });
		const instance = aiSearch.get(instanceName);
		const prompt = typeof body.prompt === "string" ? body.prompt : "What is this about?";

		try {
			switch (url.pathname) {
				case "/chat": {
					const { text, sources } = await generateText({
						model: instance.chat(),
						messages: [{ role: "user", content: prompt }],
					});
					return json({ text, sourceCount: sources.length });
				}

				case "/stream": {
					const result = streamText({
						model: instance.chat(),
						messages: [{ role: "user", content: prompt }],
					});
					let text = "";
					for await (const chunk of result.textStream) {
						text += chunk;
					}
					return json({ text, finishReason: await result.finishReason });
				}

				case "/search": {
					const query = typeof body.query === "string" ? body.query : prompt;
					const result = await instance.search({ query });
					return json({
						searchQuery: result.search_query,
						chunkCount: result.chunks?.length ?? 0,
					});
				}

				case "/items/upload": {
					const name = typeof body.name === "string" ? body.name : "e2e-test.md";
					const content =
						typeof body.content === "string"
							? body.content
							: "# E2E test\nUploaded by the ai-search-provider e2e suite.";
					const item = await instance.items.upload(name, content);
					return json({ item });
				}

				case "/items/upload-and-poll": {
					const name = typeof body.name === "string" ? body.name : "e2e-test.md";
					const content =
						typeof body.content === "string"
							? body.content
							: "# E2E test\nUploaded by the ai-search-provider e2e suite.";
					// Uploads then polls until the item is indexed (may take a while).
					const item = await instance.items.uploadAndPoll(name, content);
					return json({ item });
				}

				case "/items/list": {
					const items = await instance.items.list();
					return json({ items });
				}

				case "/items/get": {
					const item = await instance.items.get(String(body.itemId)).info();
					return json({ item });
				}

				case "/items/download": {
					const result = await instance.items.get(String(body.itemId)).download();
					return json({ downloaded: true, keys: Object.keys(result as object) });
				}

				case "/items/delete": {
					await instance.items.delete(String(body.itemId));
					return json({ deleted: true });
				}

				default:
					return json({ error: "not found" }, 404);
			}
		} catch (error) {
			return json({ error: error instanceof Error ? error.message : String(error) }, 500);
		}
	},
};
