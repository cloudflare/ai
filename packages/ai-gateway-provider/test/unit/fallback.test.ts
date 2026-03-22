import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAIGatewayFallback } from "../../src";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_GATEWAY = "my-gateway";
const GATEWAY_URL = `https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`;

function makeGenerateResponse(text: string) {
	return {
		id: "chatcmpl-test123",
		created_at: Math.floor(Date.now() / 1000),
		model: "gpt-4o-mini",
		output: [
			{
				type: "message",
				role: "assistant",
				id: "msg-test123",
				content: [{ type: "output_text", text, annotations: [] }],
			},
		],
		incomplete_details: null,
		object: "response",
		usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 },
	};
}

function makeStreamResponse(text: string) {
	const chunks = text.split(" ");
	const lines = [
		`data: {"type":"response.created","response":{"id":"resp-123","created_at":${Math.floor(Date.now() / 1000)},"model":"gpt-4o-mini"}}\n\n`,
		`data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","role":"assistant","id":"msg-123","content":[]}}\n\n`,
	];
	for (let i = 0; i < chunks.length; i++) {
		const delta = i < chunks.length - 1 ? `${chunks[i]} ` : chunks[i];
		lines.push(
			`data: {"type":"response.output_text.delta","item_id":"msg-123","delta":"${delta}"}\n\n`,
		);
	}
	lines.push(
		`data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","role":"assistant","id":"msg-123","content":[{"type":"output_text","text":"${text}","annotations":[]}]}}\n\n`,
	);
	lines.push(
		`data: {"type":"response.completed","response":{"id":"resp-123","created_at":${Math.floor(Date.now() / 1000)},"model":"gpt-4o-mini","output":[{"type":"message","role":"assistant","id":"msg-123","content":[{"type":"output_text","text":"${text}","annotations":[]}]}],"object":"response","usage":{"input_tokens":5,"output_tokens":2,"total_tokens":7}}}\n\n`,
	);
	lines.push("data: [DONE]");
	return lines.join("");
}

const server = setupServer();

describe("createAIGatewayFallback — API mode", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should generate text with the first model (step 0)", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(makeGenerateResponse("First model responded"), {
					headers: { "cf-aig-step": "0" },
				});
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		const result = await generateText({
			model,
			prompt: "Hello",
		});

		expect(result.text).toBe("First model responded");
	});

	it("should fall back to the second model (step 1)", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(makeGenerateResponse("Fallback model responded"), {
					headers: { "cf-aig-step": "1" },
				});
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		const result = await generateText({
			model,
			prompt: "Hello",
		});

		expect(result.text).toBe("Fallback model responded");
	});

	it("should send all models in the request body", async () => {
		let capturedBody: any = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedBody = await request.json();
				return HttpResponse.json(makeGenerateResponse("ok"), {
					headers: { "cf-aig-step": "0" },
				});
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		await generateText({ model, prompt: "Hello" });

		expect(capturedBody).toHaveLength(2);
		expect(capturedBody[0].provider).toBe("openai");
		expect(capturedBody[1].provider).toBe("openai");
		expect(capturedBody[0].query).toBeDefined();
		expect(capturedBody[1].query).toBeDefined();
	});

	it("should stream text with fallback", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return new HttpResponse(makeStreamResponse("Streamed fallback"), {
					headers: {
						"Content-Type": "text/event-stream",
						"Transfer-Encoding": "chunked",
						"cf-aig-step": "0",
					},
				});
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		const result = streamText({ model, prompt: "Hello" });

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Streamed fallback");
	});

	it("should send gateway options as headers", async () => {
		let capturedHeaders: Headers | null = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedHeaders = request.headers;
				return HttpResponse.json(makeGenerateResponse("ok"), {
					headers: { "cf-aig-step": "0" },
				});
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			models: [openai("gpt-4o-mini")],
			options: { cacheTtl: 3600, collectLog: true },
		});

		await generateText({ model, prompt: "Hello" });

		expect(capturedHeaders!.get("cf-aig-cache-ttl")).toBe("3600");
		expect(capturedHeaders!.get("cf-aig-collect-log")).toBe("true");
	});

	it("should expose modelId and provider from the first model", () => {
		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		expect(model.modelId).toBeDefined();
		expect(model.provider).toBeDefined();
	});

	it("should throw if models array is empty", () => {
		expect(() =>
			createAIGatewayFallback({
				accountId: TEST_ACCOUNT_ID,
				apiKey: TEST_API_KEY,
				gateway: TEST_GATEWAY,
				models: [],
			}),
		).toThrow("createAIGatewayFallback requires at least one model");
	});
});

describe("createAIGatewayFallback — Binding mode", () => {
	it("should generate text via binding with fallback", async () => {
		const mockBinding = {
			run: async (_data: unknown) => {
				return new Response(JSON.stringify(makeGenerateResponse("Binding fallback ok")), {
					headers: { "cf-aig-step": "0" },
				});
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			binding: mockBinding,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		const result = await generateText({ model, prompt: "Hello" });

		expect(result.text).toBe("Binding fallback ok");
	});

	it("should send all models to the binding", async () => {
		let capturedData: any = null;
		const mockBinding = {
			run: async (data: unknown) => {
				capturedData = data;
				return new Response(JSON.stringify(makeGenerateResponse("ok")), {
					headers: { "cf-aig-step": "0" },
				});
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			binding: mockBinding,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		await generateText({ model, prompt: "Hello" });

		expect(capturedData).toHaveLength(2);
		expect(capturedData[0].provider).toBe("openai");
		expect(capturedData[1].provider).toBe("openai");
	});

	it("should route to the correct fallback model via cf-aig-step", async () => {
		const mockBinding = {
			run: async () => {
				return new Response(JSON.stringify(makeGenerateResponse("Second model won")), {
					headers: { "cf-aig-step": "1" },
				});
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			binding: mockBinding,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		const result = await generateText({ model, prompt: "Hello" });

		expect(result.text).toBe("Second model won");
	});

	it("should stream with fallback via binding", async () => {
		const mockBinding = {
			run: async () => {
				return new Response(makeStreamResponse("Binding stream fallback"), {
					headers: {
						"Content-Type": "text/event-stream",
						"cf-aig-step": "0",
					},
				});
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			binding: mockBinding,
			models: [openai("gpt-4o-mini")],
		});

		const result = streamText({ model, prompt: "Hello" });

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Binding stream fallback");
	});
});
