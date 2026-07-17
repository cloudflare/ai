import { generateText, streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { createAISearchNamespace } from "../src";

const chunks: AiSearchSearchResponse["chunks"] = [
	{
		id: "chunk-1",
		type: "text",
		score: 0.91,
		text: "AI Search indexes content for retrieval.",
		item: {
			key: "guide.md",
			timestamp: 1775925540,
			metadata: { category: "docs" },
		},
		scoring_details: { vector_score: 0.91 },
	},
];

function createStream(parts: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const part of parts) {
				controller.enqueue(encoder.encode(part));
			}
			controller.close();
		},
	});
}

function createMockInstance() {
	const itemInfo = {
		id: "item-1",
		key: "guide.md",
		status: "completed",
	} as unknown as AiSearchItemInfo;

	const item = {
		info: vi.fn(async () => itemInfo),
		download: vi.fn(async () => ({
			body: createStream(["file contents"]),
			contentType: "text/markdown",
			filename: "guide.md",
			size: 13,
		})),
	};

	const items = {
		list: vi.fn(async () => ({ result: [itemInfo], result_info: { count: 1 } })),
		upload: vi.fn(async () => itemInfo),
		uploadAndPoll: vi.fn(async () => itemInfo),
		delete: vi.fn(async () => undefined),
		get: vi.fn(() => item),
	} as unknown as AiSearchInstance["items"];

	const chatResponse = {
		id: "chatcmpl-1",
		object: "chat.completion",
		model: "@cf/test/model",
		choices: [
			{
				index: 0,
				message: { role: "assistant", content: "AI Search says hello." },
				finish_reason: "stop",
			},
		],
		chunks,
		usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
	} as unknown as AiSearchChatCompletionsResponse;

	const streamResponse = createStream([
		`event: chunks\ndata: ${JSON.stringify(chunks)}\n\n`,
		`data: ${JSON.stringify({ choices: [{ delta: { content: "Hello " } }] })}\n\n`,
		`data: ${JSON.stringify({ choices: [{ delta: { content: "from AI Search" } }] })}\n\n`,
		"data: [DONE]\n\n",
	]);

	const instance = {
		chatCompletions: vi.fn(async (params: AiSearchChatCompletionsRequest) =>
			params.stream ? streamResponse : chatResponse,
		),
		search: vi.fn(async () => ({ search_query: "hello", chunks })),
		items,
	} as unknown as AiSearchInstance;

	return { instance, item, items };
}

function createMockNamespace(instance: AiSearchInstance) {
	return {
		get: vi.fn(() => instance),
		list: vi.fn(async () => ({ result: [{ id: "docs" }], result_info: { count: 1 } })),
	} as unknown as AiSearchNamespace;
}

describe("createAISearchNamespace", () => {
	it("generates text via an instance from the namespace", async () => {
		const { instance } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const aiSearch = createAISearchNamespace({ binding: namespace });
		const docs = aiSearch.get("docs");

		const result = await generateText({
			model: docs.chat({
				model: "@cf/test/model",
				ai_search_options: { retrieval: { max_num_results: 3 } },
			}),
			messages: [{ role: "user", content: "Hello" }],
		});

		expect(result.text).toBe("AI Search says hello.");
		expect(namespace.get).toHaveBeenCalledWith("docs");
		expect(instance.chatCompletions).toHaveBeenCalledWith({
			messages: [{ role: "user", content: "Hello" }],
			model: "@cf/test/model",
			ai_search_options: { retrieval: { max_num_results: 3 } },
		});
	});

	it("streams text via an instance from the namespace", async () => {
		const { instance } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const docs = createAISearchNamespace({ binding: namespace }).get("docs");

		const result = streamText({
			model: docs.chat(),
			messages: [{ role: "user", content: "Hello" }],
		});

		let text = "";
		for await (const part of result.textStream) {
			text += part;
		}

		expect(text).toBe("Hello from AI Search");
		expect(instance.chatCompletions).toHaveBeenCalledWith({
			messages: [{ role: "user", content: "Hello" }],
			stream: true,
		});
	});

	it("passes search through to the instance", async () => {
		const { instance } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const docs = createAISearchNamespace({ binding: namespace }).get("docs");

		const result = await docs.search({ query: "hello" });

		expect(result.chunks).toEqual(chunks);
		expect(instance.search).toHaveBeenCalledWith({ query: "hello" });
	});

	it("passes item operations through to the instance", async () => {
		const { instance, item, items } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const docs = createAISearchNamespace({ binding: namespace }).get("docs");

		await docs.items.upload("guide.md", "# Guide");
		await docs.items.uploadAndPoll("guide.md", "# Guide", { timeoutMs: 1000 });
		await docs.items.list({ per_page: 10 });
		await docs.items.delete("item-1");
		await docs.items.get("item-1").info();
		await docs.items.get("item-1").download();

		expect(items.upload).toHaveBeenCalledWith("guide.md", "# Guide", undefined);
		expect(items.uploadAndPoll).toHaveBeenCalledWith("guide.md", "# Guide", { timeoutMs: 1000 });
		expect(items.list).toHaveBeenCalledWith({ per_page: 10 });
		expect(items.delete).toHaveBeenCalledWith("item-1");
		expect(items.get).toHaveBeenCalledWith("item-1");
		expect(item.info).toHaveBeenCalled();
		expect(item.download).toHaveBeenCalled();
	});

	it("lists instances in the namespace", async () => {
		const { instance } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const aiSearch = createAISearchNamespace({ binding: namespace });

		await aiSearch.list({ per_page: 10 });

		expect(namespace.list).toHaveBeenCalledWith({ per_page: 10 });
	});

	it("forwards tools and toolChoice to the binding", async () => {
		const { instance } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const docs = createAISearchNamespace({ binding: namespace }).get("docs");

		await generateText({
			model: docs.chat(),
			messages: [{ role: "user", content: "What is 2+2?" }],
			tools: {
				calculator: {
					description: "Add two numbers",
					inputSchema: z.object({
						a: z.number(),
						b: z.number(),
					}),
				},
			},
			toolChoice: "required",
		});

		const call = (instance.chatCompletions as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(call.tools).toHaveLength(1);
		expect(call.tools[0].type).toBe("function");
		expect(call.tools[0].function.name).toBe("calculator");
		expect(call.tools[0].function.description).toBe("Add two numbers");
		expect(call.tools[0].function.parameters).toBeDefined();
		expect(call.tool_choice).toBe("required");
	});

	it("forwards generation options to the binding", async () => {
		const { instance } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const docs = createAISearchNamespace({ binding: namespace }).get("docs");

		await generateText({
			model: docs.chat(),
			messages: [{ role: "user", content: "Hello" }],
			maxOutputTokens: 10,
			temperature: 0.2,
			stopSequences: ["STOP"],
			topP: 0.9,
			topK: 20,
			seed: 123,
		});

		expect(instance.chatCompletions).toHaveBeenCalledWith({
			messages: [{ role: "user", content: "Hello" }],
			temperature: 0.2,
			max_tokens: 10,
			top_p: 0.9,
			top_k: 20,
			stop: ["STOP"],
			seed: 123,
		});
	});

	it("emits retrieved chunks as source parts (generate)", async () => {
		const { instance } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const docs = createAISearchNamespace({ binding: namespace }).get("docs");

		const result = await generateText({
			model: docs.chat(),
			messages: [{ role: "user", content: "Hello" }],
		});

		expect(result.sources).toHaveLength(1);
		const source = result.sources[0] as {
			sourceType: string;
			id: string;
			url?: string;
			providerMetadata?: Record<string, Record<string, unknown>>;
		};
		expect(source.sourceType).toBe("url");
		expect(source.id).toBe("chunk-1");
		expect(source.url).toBe("guide.md");
		expect(source.providerMetadata?.aisearch?.score).toBe(0.91);
		expect(source.providerMetadata?.aisearch?.item).toMatchObject({ key: "guide.md" });
	});

	it("emits retrieved chunks as source parts (stream)", async () => {
		const { instance } = createMockInstance();
		const namespace = createMockNamespace(instance);
		const docs = createAISearchNamespace({ binding: namespace }).get("docs");

		const result = streamText({
			model: docs.chat(),
			messages: [{ role: "user", content: "Hello" }],
		});

		const sources: unknown[] = [];
		for await (const part of result.fullStream) {
			if (part.type === "source") {
				sources.push(part);
			}
		}

		expect(sources).toHaveLength(1);
		const source = sources[0] as { sourceType: string; id: string; url?: string };
		expect(source.sourceType).toBe("url");
		expect(source.id).toBe("chunk-1");
		expect(source.url).toBe("guide.md");
	});
});
