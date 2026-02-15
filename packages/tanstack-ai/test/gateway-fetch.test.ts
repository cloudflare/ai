import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createGatewayFetch,
	type AiGatewayAdapterConfig,
	type AiGatewayBindingConfig,
	type AiGatewayCredentialsConfig,
} from "../src/utils/create-fetcher";

// ---------------------------------------------------------------------------
// createGatewayFetch
// ---------------------------------------------------------------------------

describe("createGatewayFetch", () => {
	const mockResponse = new Response("ok", { status: 200 });

	describe("binding config", () => {
		const mockBinding = {
			run: vi.fn().mockResolvedValue(mockResponse),
		};

		const bindingConfig: AiGatewayBindingConfig = {
			binding: mockBinding,
		};

		beforeEach(() => {
			mockBinding.run.mockClear();
		});

		it("should call binding.run with the correct request structure", async () => {
			const fetcher = createGatewayFetch("openai", bindingConfig);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({ model: "gpt-4o", messages: [] }),
			});

			expect(mockBinding.run).toHaveBeenCalledOnce();
			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.provider).toBe("openai");
			expect(request.endpoint).toBe("chat/completions");
			expect(request.query).toEqual({ model: "gpt-4o", messages: [] });
			expect(request.headers["Content-Type"]).toBe("application/json");
		});

		it("should strip /v1/ prefix from endpoint", async () => {
			const fetcher = createGatewayFetch("openai", bindingConfig);

			await fetcher("https://api.openai.com/v1/audio/transcriptions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.endpoint).toBe("audio/transcriptions");
		});

		it("should handle URL objects as input", async () => {
			const fetcher = createGatewayFetch("openai", bindingConfig);
			const url = new URL("https://api.openai.com/v1/chat/completions");

			await fetcher(url, {
				method: "POST",
				body: JSON.stringify({ model: "gpt-4o" }),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.endpoint).toBe("chat/completions");
		});

		it("should handle Request objects as input", async () => {
			const fetcher = createGatewayFetch("openai", bindingConfig);
			const req = new Request("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({ model: "gpt-4o" }),
			});

			await fetcher(req, {
				method: "POST",
				body: JSON.stringify({ model: "gpt-4o" }),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.endpoint).toBe("chat/completions");
		});

		it("should set authorization header when apiKey is provided", async () => {
			const configWithKey: AiGatewayBindingConfig = {
				binding: mockBinding,
				apiKey: "sk-test-key",
			};
			const fetcher = createGatewayFetch("openai", configWithKey);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.headers["authorization"]).toBe("Bearer sk-test-key");
		});

		it("should not set authorization header when apiKey is absent", async () => {
			const fetcher = createGatewayFetch("openai", bindingConfig);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.headers["authorization"]).toBeUndefined();
		});

		it("should include extra headers passed to createGatewayFetch", async () => {
			const fetcher = createGatewayFetch("anthropic", bindingConfig, {
				"anthropic-version": "2023-06-01",
			});

			await fetcher("https://api.anthropic.com/v1/messages", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.headers["anthropic-version"]).toBe("2023-06-01");
		});

		it("should handle non-JSON body by wrapping in _raw", async () => {
			const fetcher = createGatewayFetch("openai", bindingConfig);

			await fetcher("https://api.openai.com/v1/audio/transcriptions", {
				method: "POST",
				body: "not-json-content",
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.query).toEqual({ _raw: "not-json-content" });
		});
	});

	describe("credentials config", () => {
		const originalFetch = globalThis.fetch;
		const mockFetch = vi.fn().mockResolvedValue(mockResponse);

		beforeEach(() => {
			globalThis.fetch = mockFetch;
			mockFetch.mockClear();
		});

		afterEach(() => {
			globalThis.fetch = originalFetch;
		});

		const credentialsConfig: AiGatewayCredentialsConfig = {
			accountId: "test-account",
			gatewayId: "test-gateway",
		};

		it("should call fetch with the correct gateway URL", async () => {
			const fetcher = createGatewayFetch("openai", credentialsConfig);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({ model: "gpt-4o" }),
			});

			expect(mockFetch).toHaveBeenCalledOnce();
			const [url] = mockFetch.mock.calls[0]!;
			expect(url).toBe("https://gateway.ai.cloudflare.com/v1/test-account/test-gateway");
		});

		it("should send the request object as JSON body", async () => {
			const fetcher = createGatewayFetch("openai", credentialsConfig);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({ model: "gpt-4o", messages: [] }),
			});

			const [, init] = mockFetch.mock.calls[0]!;
			const body = JSON.parse(init.body);
			expect(body.provider).toBe("openai");
			expect(body.endpoint).toBe("chat/completions");
			expect(body.query).toEqual({ model: "gpt-4o", messages: [] });
		});

		it("should set cf-aig-authorization header when cfApiKey is provided", async () => {
			const configWithCfKey: AiGatewayCredentialsConfig = {
				...credentialsConfig,
				cfApiKey: "cf-test-key",
			};
			const fetcher = createGatewayFetch("openai", configWithCfKey);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const [, init] = mockFetch.mock.calls[0]!;
			expect(init.headers["cf-aig-authorization"]).toBe("Bearer cf-test-key");
		});

		it("should not set cf-aig-authorization header when cfApiKey is absent", async () => {
			const fetcher = createGatewayFetch("openai", credentialsConfig);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const [, init] = mockFetch.mock.calls[0]!;
			expect(init.headers["cf-aig-authorization"]).toBeUndefined();
		});
	});

	describe("cache headers", () => {
		const mockBinding = {
			run: vi.fn().mockResolvedValue(mockResponse),
		};

		beforeEach(() => {
			mockBinding.run.mockClear();
		});

		it("should set cf-aig-skip-cache when skipCache is true", async () => {
			const config: AiGatewayAdapterConfig = {
				binding: mockBinding,
				skipCache: true,
			};
			const fetcher = createGatewayFetch("openai", config);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.headers["cf-aig-skip-cache"]).toBe("true");
		});

		it("should set cf-aig-cache-ttl when cacheTtl is provided", async () => {
			const config: AiGatewayAdapterConfig = {
				binding: mockBinding,
				cacheTtl: 3600,
			};
			const fetcher = createGatewayFetch("openai", config);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.headers["cf-aig-cache-ttl"]).toBe("3600");
		});

		it("should set cf-aig-cache-key when customCacheKey is provided", async () => {
			const config: AiGatewayAdapterConfig = {
				binding: mockBinding,
				customCacheKey: "my-cache-key",
			};
			const fetcher = createGatewayFetch("openai", config);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.headers["cf-aig-cache-key"]).toBe("my-cache-key");
		});

		it("should set cf-aig-metadata as JSON when metadata is provided", async () => {
			const metadata = { user: "test", session: "abc123" };
			const config: AiGatewayAdapterConfig = {
				binding: mockBinding,
				metadata,
			};
			const fetcher = createGatewayFetch("openai", config);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.headers["cf-aig-metadata"]).toBe(JSON.stringify(metadata));
		});

		it("should not set cache headers when no cache options are provided", async () => {
			const config: AiGatewayAdapterConfig = {
				binding: mockBinding,
			};
			const fetcher = createGatewayFetch("openai", config);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.headers["cf-aig-skip-cache"]).toBeUndefined();
			expect(request.headers["cf-aig-cache-ttl"]).toBeUndefined();
			expect(request.headers["cf-aig-cache-key"]).toBeUndefined();
			expect(request.headers["cf-aig-metadata"]).toBeUndefined();
		});
	});

	describe("workers-ai provider", () => {
		const mockBinding = {
			run: vi.fn().mockResolvedValue(mockResponse),
		};

		beforeEach(() => {
			mockBinding.run.mockClear();
		});

		it("should set endpoint to model name and strip model from query", async () => {
			const config: AiGatewayAdapterConfig = {
				binding: mockBinding,
				apiKey: "test-key",
			};
			const fetcher = createGatewayFetch("workers-ai", config);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({
					model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
					messages: [{ role: "user", content: "Hello" }],
				}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.provider).toBe("workers-ai");
			expect(request.endpoint).toBe("run/@cf/meta/llama-3.3-70b-instruct-fp8-fast");
			expect(request.query.model).toBeUndefined();
			expect(request.query.messages).toEqual([{ role: "user", content: "Hello" }]);
		});

		it("should strip instructions from query", async () => {
			const config: AiGatewayAdapterConfig = {
				binding: mockBinding,
				apiKey: "test-key",
			};
			const fetcher = createGatewayFetch("workers-ai", config);

			await fetcher("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({
					model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
					instructions: "You are a helpful assistant",
					messages: [],
				}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.query.instructions).toBeUndefined();
			expect(request.query.messages).toEqual([]);
		});
	});

	describe("endpoint extraction", () => {
		const mockBinding = {
			run: vi.fn().mockResolvedValue(mockResponse),
		};

		beforeEach(() => {
			mockBinding.run.mockClear();
		});

		const config: AiGatewayAdapterConfig = { binding: mockBinding };

		it("should preserve query parameters in endpoint", async () => {
			const fetcher = createGatewayFetch("openai", config);

			await fetcher("https://api.openai.com/v1/files?purpose=assistants", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.endpoint).toBe("files?purpose=assistants");
		});

		it("should handle paths without /v1/ prefix", async () => {
			const fetcher = createGatewayFetch("anthropic", config);

			await fetcher("https://api.anthropic.com/messages", {
				method: "POST",
				body: JSON.stringify({}),
			});

			const request = mockBinding.run.mock.calls[0]![0];
			expect(request.endpoint).toBe("messages");
		});
	});
});
