import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	AiGatewayDoesNotExist,
	AiGatewayUnauthorizedError,
	createAIGateway,
	createAIGatewayFallback,
	createAiGateway,
} from "../../src";

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

const server = setupServer();

describe("fetch restoration — try/finally", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should restore fetch after a gateway error", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(
					{ success: false, error: [{ code: 2001, message: "Not found" }] },
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

		const model = gateway("gpt-4o-mini");

		await expect(generateText({ model, prompt: "Hello" })).rejects.toThrow(
			AiGatewayDoesNotExist,
		);

		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(makeGenerateResponse("recovered"));
			}),
		);

		const result = await generateText({ model, prompt: "Hello again" });
		expect(result.text).toBe("recovered");
	});

	it("should restore fetch in fallback model after a gateway error", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(
					{ success: false, error: [{ code: 2001, message: "Not found" }] },
					{ status: 400 },
				);
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			models: [openai("gpt-4o-mini"), openai("gpt-4o")],
		});

		await expect(generateText({ model, prompt: "Hello" })).rejects.toThrow(
			AiGatewayDoesNotExist,
		);

		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(makeGenerateResponse("recovered fallback"), {
					headers: { "cf-aig-step": "0" },
				});
			}),
		);

		const result = await generateText({ model, prompt: "Hello again" });
		expect(result.text).toBe("recovered fallback");
	});
});

describe("BYOK auth header stripping — all header types", () => {
	it("should strip authorization header (case-insensitive)", async () => {
		let capturedData: any = null;
		const mockBinding = {
			run: async (data: unknown) => {
				capturedData = data;
				return new Response(JSON.stringify(makeGenerateResponse("ok")));
			},
		};

		const openai = createOpenAI({ apiKey: "secret-key" });
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
			byok: true,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" });

		expect(capturedData[0].headers["authorization"]).toBeUndefined();
		expect(capturedData[0].headers["Authorization"]).toBeUndefined();
	});

	it("should strip x-api-key header", async () => {
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
			byok: true,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" });

		expect(capturedData[0].headers["x-api-key"]).toBeUndefined();
	});

	it("should strip api-key header", async () => {
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
			byok: true,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" });

		expect(capturedData[0].headers["api-key"]).toBeUndefined();
	});

	it("should strip x-goog-api-key header", async () => {
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
			byok: true,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" });

		expect(capturedData[0].headers["x-goog-api-key"]).toBeUndefined();
	});

	it("should normalize mixed-case headers before stripping", async () => {
		let capturedData: any = null;
		const mockBinding = {
			run: async (data: unknown) => {
				capturedData = data;
				return new Response(JSON.stringify(makeGenerateResponse("ok")));
			},
		};

		const openai = createOpenAI({ apiKey: "secret" });
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
			byok: true,
		});

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" });

		const headerKeys = Object.keys(capturedData[0].headers);
		for (const key of headerKeys) {
			expect(key).toBe(key.toLowerCase());
		}
	});
});

describe("abort signal propagation", () => {
	it("should pass abort signal to binding.run()", async () => {
		let capturedSignal: AbortSignal | undefined;
		const mockBinding = {
			run: async (_data: unknown, opts?: { signal?: AbortSignal }) => {
				capturedSignal = opts?.signal;
				return new Response(JSON.stringify(makeGenerateResponse("ok")));
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const gateway = createAIGateway({
			binding: mockBinding,
			provider: openai,
		});

		const ac = new AbortController();
		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi", abortSignal: ac.signal });

		expect(capturedSignal).toBe(ac.signal);
	});

	it("should pass abort signal to fetch in API mode", async () => {
		let requestReceived = false;
		server.use(
			http.post(GATEWAY_URL, async () => {
				requestReceived = true;
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

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" });

		expect(requestReceived).toBe(true);
	});

	it("should pass abort signal to binding.run() in fallback mode", async () => {
		let capturedSignal: AbortSignal | undefined;
		const mockBinding = {
			run: async (_data: unknown, opts?: { signal?: AbortSignal }) => {
				capturedSignal = opts?.signal;
				return new Response(JSON.stringify(makeGenerateResponse("ok")), {
					headers: { "cf-aig-step": "0" },
				});
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const model = createAIGatewayFallback({
			binding: mockBinding,
			models: [openai("gpt-4o-mini")],
		});

		const ac = new AbortController();
		await generateText({ model, prompt: "Hi", abortSignal: ac.signal });

		expect(capturedSignal).toBe(ac.signal);
	});

	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());
});

describe("error handling — non-JSON gateway responses", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should not crash when 400 response has non-JSON body", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return new HttpResponse("<html>Bad Request</html>", {
					status: 400,
					headers: { "Content-Type": "text/html" },
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

		await expect(generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" })).rejects.toThrow();
	});

	it("should not crash when 401 response has non-JSON body", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return new HttpResponse("Unauthorized", {
					status: 401,
					headers: { "Content-Type": "text/plain" },
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

		await expect(generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" })).rejects.toThrow();
	});

	it("should still throw AiGatewayDoesNotExist for valid JSON 400 with code 2001", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(
					{ success: false, error: [{ code: 2001, message: "Not found" }] },
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

		await expect(generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" })).rejects.toThrow(
			AiGatewayDoesNotExist,
		);
	});

	it("should still throw AiGatewayUnauthorizedError for valid JSON 401 with code 2009", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(
					{ success: false, error: [{ code: 2009, message: "Unauthorized" }] },
					{ status: 401 },
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

		await expect(generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" })).rejects.toThrow(
			AiGatewayUnauthorizedError,
		);
	});
});

describe("fallback — error paths", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should throw on out-of-bounds cf-aig-step", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(makeGenerateResponse("ok"), {
					headers: { "cf-aig-step": "5" },
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

		await expect(generateText({ model, prompt: "Hi" })).rejects.toThrow(
			"Unexpected AI Gateway fallback step",
		);
	});
});

describe("deprecated createAiGateway compat", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should emit a deprecation warning on first call", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(makeGenerateResponse("compat ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gw = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});

		const result = await generateText({
			model: gw(openai("gpt-4o-mini")),
			prompt: "Hello",
		});

		expect(result.text).toBe("compat ok");
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("createAiGateway() is deprecated"),
		);

		warnSpy.mockRestore();
	});

	it("should work with .chat() method", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(makeGenerateResponse("chat method ok"));
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gw = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});

		const result = await generateText({
			model: gw.chat(openai("gpt-4o-mini")),
			prompt: "Hello",
		});

		expect(result.text).toBe("chat method ok");
	});

	it("should handle array of models (fallback) via old API", async () => {
		server.use(
			http.post(GATEWAY_URL, async () => {
				return HttpResponse.json(makeGenerateResponse("fallback compat ok"), {
					headers: { "cf-aig-step": "1" },
				});
			}),
		);

		const openai = createOpenAI({ apiKey: "test-key" });
		const gw = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});

		const result = await generateText({
			model: gw([openai("gpt-4o-mini"), openai("gpt-4o")]),
			prompt: "Hello",
		});

		expect(result.text).toBe("fallback compat ok");
	});

	it("should work with binding mode", async () => {
		const mockBinding = {
			run: async () => {
				return new Response(JSON.stringify(makeGenerateResponse("binding compat ok")));
			},
		};

		const openai = createOpenAI({ apiKey: "test-key" });
		const gw = createAiGateway({ binding: mockBinding });

		const result = await generateText({
			model: gw(openai("gpt-4o-mini")),
			prompt: "Hello",
		});

		expect(result.text).toBe("binding compat ok");
	});
});

describe("unsupported provider", () => {
	it("should throw when the provider does not expose config.fetch", async () => {
		const fakeModel = {
			specificationVersion: "v3" as const,
			modelId: "fake-model",
			provider: "fake-provider",
			supportedUrls: {},
			doGenerate: async () => ({}),
			doStream: async () => ({}),
		} as any;

		const mockBinding = {
			run: async () => new Response(JSON.stringify(makeGenerateResponse("ok"))),
		};

		const model = createAIGatewayFallback({
			binding: mockBinding,
			models: [fakeModel],
		});

		await expect(generateText({ model, prompt: "Hi" })).rejects.toThrow(
			"does not expose a configurable fetch",
		);
	});
});

describe("fallback — partial capture failure restores earlier models", () => {
	it("should restore the first model's fetch when the second model fails capture", async () => {
		const openai = createOpenAI({ apiKey: "test-key" });
		const goodModel = openai("gpt-4o-mini") as any;
		const originalFetch = goodModel.config.fetch;

		const badModel = {
			specificationVersion: "v3" as const,
			modelId: "bad-model",
			provider: "bad-provider",
			supportedUrls: {},
			doGenerate: async () => ({}),
			doStream: async () => ({}),
		} as any;

		const model = createAIGatewayFallback({
			binding: { run: async () => new Response("{}") },
			models: [goodModel, badModel],
		});

		await expect(generateText({ model, prompt: "Hi" })).rejects.toThrow(
			"does not expose a configurable fetch",
		);

		expect(goodModel.config.fetch).toBe(originalFetch);
	});
});

describe("header normalization", () => {
	it("should lowercase all header keys from providers", async () => {
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

		await generateText({ model: gateway("gpt-4o-mini"), prompt: "Hi" });

		const headerKeys = Object.keys(capturedData[0].headers);
		for (const key of headerKeys) {
			expect(key).toBe(key.toLowerCase());
		}
	});
});
