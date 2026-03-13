import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AiGatewayDoesNotExist, AiGatewayUnauthorizedError, createAIGateway } from "../../src";

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

const defaultHandler = http.post(GATEWAY_URL, async () => {
	return HttpResponse.json(makeGenerateResponse("Hello from gateway"));
});

const server = setupServer(defaultHandler);

describe("createAIGateway — API mode", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should generate text through the gateway", async () => {
		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		expect(result.text).toBe("Hello from gateway");
	});

	it("should stream text through the gateway", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return new HttpResponse(makeStreamResponse("Hello streamed world"), {
					headers: {
						"Content-Type": "text/event-stream",
						"Transfer-Encoding": "chunked",
					},
				});
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		const result = streamText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Hello streamed world");
	});

	it("should send cf-aig-authorization header with API key", async () => {
		let capturedHeaders: Headers | null = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedHeaders = request.headers;
				return HttpResponse.json(makeGenerateResponse("ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: "my-secret-key",
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" });

		expect(capturedHeaders!.get("cf-aig-authorization")).toBe("Bearer my-secret-key");
	});

	it("should send gateway options as headers", async () => {
		let capturedHeaders: Headers | null = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedHeaders = request.headers;
				return HttpResponse.json(makeGenerateResponse("ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
			options: {
				cacheTtl: 3600,
				skipCache: true,
				metadata: { userId: "user-123" },
				collectLog: true,
				eventId: "evt-abc",
			},
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" });

		expect(capturedHeaders!.get("cf-aig-skip-cache")).toBe("true");
		expect(capturedHeaders!.get("cf-aig-cache-ttl")).toBe("3600");
		expect(capturedHeaders!.get("cf-aig-metadata")).toBe('{"userId":"user-123"}');
		expect(capturedHeaders!.get("cf-aig-collect-log")).toBe("true");
		expect(capturedHeaders!.get("cf-aig-event-id")).toBe("evt-abc");
	});

	it("should send correct provider/endpoint/query in the request body", async () => {
		let capturedBody: any = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedBody = await request.json();
				return HttpResponse.json(makeGenerateResponse("ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" });

		expect(capturedBody).toHaveLength(1);
		expect(capturedBody[0].provider).toBe("openai");
		expect(capturedBody[0].endpoint).toMatch(/^v1\//);
		expect(capturedBody[0].query).toBeDefined();
		expect(capturedBody[0].headers).toBeDefined();
	});

	it("should include provider auth headers in the request body", async () => {
		let capturedBody: any = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedBody = await request.json();
				return HttpResponse.json(makeGenerateResponse("ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "sk-my-openai-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" });

		expect(capturedBody[0].headers.authorization).toBe("Bearer sk-my-openai-key");
	});

	it("should throw AiGatewayDoesNotExist on 400 with code 2001", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(
					{
						success: false,
						error: [{ code: 2001, message: "Gateway not found" }],
					},
					{ status: 400 },
				);
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		await expect(
			generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" }),
		).rejects.toThrow(AiGatewayDoesNotExist);
	});

	it("should throw AiGatewayUnauthorizedError on 401 with code 2009", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(
					{
						success: false,
						error: [{ code: 2009, message: "Unauthorized" }],
					},
					{ status: 401 },
				);
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		await expect(
			generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" }),
		).rejects.toThrow(AiGatewayUnauthorizedError);
	});

	it("should expose modelId and provider from the wrapped model", () => {
		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		const model = gateway("gpt-4o-mini");
		expect(model.modelId).toBeDefined();
		expect(model.provider).toBeDefined();
	});
});

describe("createAIGateway — providerName (custom base URL)", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should work with a custom baseURL when providerName is set", async () => {
		let capturedBody: any = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedBody = await request.json();
				return HttpResponse.json(makeGenerateResponse("custom ok"));
			}),
		);

		const openai = createOpenAI({
			apiKey: "test-key",
			baseURL: "https://my-proxy.example.com/v1",
		});
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
			providerName: "openai",
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		expect(result.text).toBe("custom ok");
		expect(capturedBody[0].provider).toBe("openai");
		expect(capturedBody[0].endpoint).toMatch(/^v1\//);
	});

	it("should throw without providerName when baseURL is unrecognized", async () => {
		const openai = createOpenAI({
			apiKey: "test-key",
			baseURL: "https://my-proxy.example.com/v1",
		});
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		await expect(
			generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" }),
		).rejects.toThrow("did not match any known provider");
	});

	it("should override the auto-detected provider name", async () => {
		let capturedBody: any = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedBody = await request.json();
				return HttpResponse.json(makeGenerateResponse("ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
			providerName: "custom-openai",
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" });

		expect(capturedBody[0].provider).toBe("custom-openai");
		expect(capturedBody[0].endpoint).toMatch(/^v1\//);
	});

	it("should work with binding mode and custom baseURL", async () => {
		let capturedData: any = null;
		const mockBinding = {
			run: async (data: unknown) => {
				capturedData = data;
				return new Response(JSON.stringify(makeGenerateResponse("binding custom ok")));
			},
		};

		const openai = createOpenAI({
			apiKey: "test-key",
			baseURL: "https://custom-llm.internal/api/v1",
		});
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
			providerName: "openai",
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		expect(result.text).toBe("binding custom ok");
		expect(capturedData[0].provider).toBe("openai");
		expect(capturedData[0].endpoint).toMatch(/^api\/v1\//);
	});
});

describe("createAIGateway — Binding mode", () => {
	it("should generate text via binding", async () => {
		const mockBinding = {
			run: async (_data: unknown) => {
				return new Response(JSON.stringify(makeGenerateResponse("Hello from binding")));
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		expect(result.text).toBe("Hello from binding");
	});

	it("should stream text via binding", async () => {
		const mockBinding = {
			run: async () => {
				return new Response(makeStreamResponse("Binding streamed text"), {
					headers: {
						"Content-Type": "text/event-stream",
						"Transfer-Encoding": "chunked",
					},
				});
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
		});

		const result = streamText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Binding streamed text");
	});

	it("should pass gateway options to the binding as merged headers", async () => {
		let capturedData: any = null;
		const mockBinding = {
			run: async (data: unknown) => {
				capturedData = data;
				return new Response(JSON.stringify(makeGenerateResponse("ok")));
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
			options: { cacheTtl: 7200, collectLog: true },
		});

		await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		expect(capturedData).toBeTruthy();
		expect(capturedData[0].headers["cf-aig-cache-ttl"]).toBe("7200");
		expect(capturedData[0].headers["cf-aig-collect-log"]).toBe("true");
	});

	it("should pass provider info and query to the binding", async () => {
		let capturedData: any = null;
		const mockBinding = {
			run: async (data: unknown) => {
				capturedData = data;
				return new Response(JSON.stringify(makeGenerateResponse("ok")));
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
		});

		await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		expect(capturedData).toHaveLength(1);
		expect(capturedData[0].provider).toBe("openai");
		expect(capturedData[0].endpoint).toMatch(/^v1\//);
		expect(capturedData[0].query).toBeDefined();
		expect(capturedData[0].headers).toBeDefined();
		expect(capturedData[0].headers.authorization).toBe("Bearer test-key");
	});
});

describe("createAIGateway — byok: true (auth header stripping)", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should strip the authorization header when byok is true", async () => {
		let capturedBody: any = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedBody = await request.json();
				return HttpResponse.json(makeGenerateResponse("byok ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "unused" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
			byok: true,
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Hello",
		});

		expect(result.text).toBe("byok ok");
		expect(capturedBody[0].headers.authorization).toBeUndefined();
		expect(capturedBody[0].headers["x-api-key"]).toBeUndefined();
	});

	it("should keep the authorization header when byok is false", async () => {
		let capturedBody: any = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedBody = await request.json();
				return HttpResponse.json(makeGenerateResponse("ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "real-key" });
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: openai,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" });

		expect(capturedBody[0].headers.authorization).toBe("Bearer real-key");
	});

	it("should strip auth headers in binding mode with byok", async () => {
		let capturedData: any = null;
		const mockBinding = {
			run: async (data: unknown) => {
				capturedData = data;
				return new Response(JSON.stringify(makeGenerateResponse("ok")));
			},
		};

		const openai = createOpenAI({ apiKey: "unused" });
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
			byok: true,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hello" });

		expect(capturedData[0].headers.authorization).toBeUndefined();
	});
});

describe("createAIGateway — Unified API (compat endpoint)", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should route through the compat endpoint when using OpenAI SDK with compat baseURL", async () => {
		let capturedBody: any = null;
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				capturedBody = await request.json();
				return HttpResponse.json(makeGenerateResponse("compat ok"));
			}),
		);

		const compat = createOpenAI({
			apiKey: "test-key",
			baseURL: "https://gateway.ai.cloudflare.com/v1/compat",
		});
		const gateway = createAIGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			provider: compat,
		});

		const result = await generateText({
			model: gateway("openai/gpt-4o-mini"),
			prompt: "Hello",
		});

		expect(result.text).toBe("compat ok");
		expect(capturedBody[0].provider).toBe("compat");
		expect(capturedBody[0].endpoint).toMatch(/^responses/);
	});

	it("should work with compat endpoint via binding", async () => {
		let capturedData: any = null;
		const mockBinding = {
			run: async (data: unknown) => {
				capturedData = data;
				return new Response(JSON.stringify(makeGenerateResponse("compat binding ok")));
			},
		};

		const compat = createOpenAI({
			apiKey: "test-key",
			baseURL: "https://gateway.ai.cloudflare.com/v1/compat",
		});
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: compat,
		});

		const result = await generateText({
			model: gateway("google-ai-studio/gemini-2.5-pro"),
			prompt: "Hello",
		});

		expect(result.text).toBe("compat binding ok");
		expect(capturedData[0].provider).toBe("compat");
	});
});
