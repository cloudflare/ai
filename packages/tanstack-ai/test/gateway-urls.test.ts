import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Integration tests to verify that Workers AI gateway adapters pass the
 * correct model name and endpoint URL through `createGatewayFetch`.
 *
 * These tests don't mock `createGatewayFetch` — they let the real
 * implementation run and verify the actual URL / request body that
 * would reach the AI Gateway REST endpoint.
 *
 * This validates review item #12: gateway URLs are hardcoded and we
 * need to verify them.
 */

const originalFetch = globalThis.fetch;

describe("Workers AI gateway URL verification", () => {
	let mockFetch: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetch = vi.fn(
			async (..._args: unknown[]) =>
				new Response(
					// Return valid image/audio bytes for binary adapters, JSON for others
					new Uint8Array([137, 80, 78, 71]),
					{ status: 200, headers: { "Content-Type": "application/octet-stream" } },
				),
		);
		globalThis.fetch = mockFetch as any;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	const credentialsConfig = {
		accountId: "test-acct",
		gatewayId: "test-gw",
		apiKey: "test-key",
	};

	it("image adapter sends model name in body and hits gateway URL", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const adapter = new WorkersAiImageAdapter(
			credentialsConfig,
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "test prompt",
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0]!;
		// Credentials config → goes through global fetch to gateway URL
		expect(url).toBe("https://gateway.ai.cloudflare.com/v1/test-acct/test-gw");

		// Body should be a JSON string containing the request object with model
		const body = JSON.parse((init as any).body as string);
		expect(body.provider).toBe("workers-ai");
		// createGatewayFetch moves model from query to endpoint for workers-ai
		expect(body.endpoint).toBe("run/@cf/stabilityai/stable-diffusion-xl-base-1.0");
		expect(body.query.prompt).toBe("test prompt");
	});

	it("transcription adapter sends model name in body and hits gateway URL", async () => {
		// Return JSON for transcription
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ text: "hello", words: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		const adapter = new WorkersAiTranscriptionAdapter(credentialsConfig, "@cf/openai/whisper");

		await adapter.transcribe({
			model: "@cf/openai/whisper",
			audio: new ArrayBuffer(10),
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0]!;
		expect(url).toBe("https://gateway.ai.cloudflare.com/v1/test-acct/test-gw");

		const body = JSON.parse((init as any).body as string);
		expect(body.provider).toBe("workers-ai");
		expect(body.endpoint).toBe("run/@cf/openai/whisper");
	});

	it("TTS adapter sends model name in body and hits gateway URL", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");
		const adapter = new WorkersAiTTSAdapter(credentialsConfig, "@cf/deepgram/aura-1");

		await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello world",
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0]!;
		expect(url).toBe("https://gateway.ai.cloudflare.com/v1/test-acct/test-gw");

		const body = JSON.parse((init as any).body as string);
		expect(body.provider).toBe("workers-ai");
		expect(body.endpoint).toBe("run/@cf/deepgram/aura-1");
		expect(body.query.text).toBe("Hello world");
	});

	it("summarize adapter sends model name in body and hits gateway URL", async () => {
		// Return JSON for summarization
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ summary: "short text" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const { WorkersAiSummarizeAdapter } = await import("../src/adapters/workers-ai-summarize");
		const adapter = new WorkersAiSummarizeAdapter(
			credentialsConfig,
			"@cf/facebook/bart-large-cnn",
		);

		await adapter.summarize({
			model: "@cf/facebook/bart-large-cnn",
			text: "A long article...",
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0]!;
		expect(url).toBe("https://gateway.ai.cloudflare.com/v1/test-acct/test-gw");

		const body = JSON.parse((init as any).body as string);
		expect(body.provider).toBe("workers-ai");
		expect(body.endpoint).toBe("run/@cf/facebook/bart-large-cnn");
		expect(body.query.input_text).toBe("A long article...");
	});

	it("gateway request includes cache headers when configured", async () => {
		const { WorkersAiSummarizeAdapter } = await import("../src/adapters/workers-ai-summarize");

		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ summary: "test" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const adapter = new WorkersAiSummarizeAdapter(
			{
				...credentialsConfig,
				skipCache: true,
				cacheTtl: 60,
				customCacheKey: "my-cache-key",
				metadata: { env: "test" },
			},
			"@cf/facebook/bart-large-cnn",
		);

		await adapter.summarize({
			model: "@cf/facebook/bart-large-cnn",
			text: "Test text",
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [, init] = mockFetch.mock.calls[0]!;
		const body = JSON.parse((init as any).body as string);

		// Cache headers should be in the inner request headers
		expect(body.headers["cf-aig-skip-cache"]).toBe("true");
		expect(body.headers["cf-aig-cache-ttl"]).toBe("60");
		expect(body.headers["cf-aig-cache-key"]).toBe("my-cache-key");
		expect(body.headers["cf-aig-metadata"]).toBe(JSON.stringify({ env: "test" }));
	});

	it("gateway request includes cf-aig-authorization when cfApiKey is set", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const adapter = new WorkersAiImageAdapter(
			{
				...credentialsConfig,
				cfApiKey: "cf-secret",
			},
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "test",
		});

		expect(mockFetch).toHaveBeenCalledOnce();
		const [, init] = mockFetch.mock.calls[0]!;
		const headers = (init as any).headers;
		expect(headers["cf-aig-authorization"]).toBe("Bearer cf-secret");
	});
});
