import { describe, expect, it, vi } from "vitest";

describe("WorkersAiTTSAdapter", () => {
	// -----------------------------------------------------------------------
	// Binding path
	// -----------------------------------------------------------------------

	it("generateSpeech via binding: handles Uint8Array result", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const fakeAudio = new Uint8Array([0x49, 0x44, 0x33]); // ID3 tag header
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeAudio),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTTSAdapter({ binding: mockBinding }, "@cf/deepgram/aura-1");

		const result = await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello world",
		});

		expect(result).toHaveProperty("id");
		expect(result.model).toBe("@cf/deepgram/aura-1");
		expect(result.audio).toBeTruthy();
		expect(typeof result.audio).toBe("string");
		expect(result.format).toBe("mp3");
		expect(result.contentType).toBe("audio/mp3");

		// Verify base64 decodes correctly
		const decoded = atob(result.audio);
		expect(decoded.charCodeAt(0)).toBe(0x49); // 'I'
	});

	it("generateSpeech via binding: handles ArrayBuffer result", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const fakeAudio = new Uint8Array([0x49, 0x44, 0x33]).buffer;
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeAudio),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTTSAdapter({ binding: mockBinding }, "@cf/deepgram/aura-1");

		const result = await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello",
		});

		expect(result.audio).toBeTruthy();
		const decoded = atob(result.audio);
		expect(decoded.charCodeAt(0)).toBe(0x49);
	});

	it("generateSpeech via binding: handles ReadableStream result", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const chunk1 = new Uint8Array([0x49, 0x44]);
		const chunk2 = new Uint8Array([0x33]);
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(chunk1);
				controller.enqueue(chunk2);
				controller.close();
			},
		});
		const mockBinding = {
			run: vi.fn().mockResolvedValue(stream),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTTSAdapter({ binding: mockBinding }, "@cf/deepgram/aura-1");

		const result = await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello",
		});

		expect(result.audio).toBeTruthy();
		const decoded = atob(result.audio);
		expect(decoded.length).toBe(3);
		expect(decoded.charCodeAt(0)).toBe(0x49);
	});

	it("generateSpeech via binding: handles { audio: base64 } result", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const b64Audio = btoa("fake-audio-data");
		const mockBinding = {
			run: vi.fn().mockResolvedValue({ audio: b64Audio }),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTTSAdapter({ binding: mockBinding }, "@cf/deepgram/aura-1");

		const result = await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello",
		});

		expect(result.audio).toBe(b64Audio);
	});

	it("generateSpeech via binding: throws on unexpected format", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const mockBinding = {
			run: vi.fn().mockResolvedValue("unexpected string"),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTTSAdapter({ binding: mockBinding }, "@cf/deepgram/aura-1");

		await expect(
			adapter.generateSpeech({
				model: "@cf/deepgram/aura-1",
				text: "Hello",
			}),
		).rejects.toThrow(/Unexpected binary response format/);
	});

	// -----------------------------------------------------------------------
	// REST path
	// -----------------------------------------------------------------------

	it("generateSpeech via REST: returns audio on success", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const fakeBytes = new Uint8Array([0x49, 0x44, 0x33]);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response(fakeBytes, { status: 200 })) as any;

		try {
			const adapter = new WorkersAiTTSAdapter(
				{ accountId: "abc", apiKey: "key" },
				"@cf/deepgram/aura-1",
			);

			const result = await adapter.generateSpeech({
				model: "@cf/deepgram/aura-1",
				text: "Hello world",
			});

			expect(result.audio).toBeTruthy();
			expect(result.model).toBe("@cf/deepgram/aura-1");
			expect(result.format).toBe("mp3");

			// Verify correct URL and headers
			const call = (globalThis.fetch as any).mock.calls[0]!;
			expect(call[0]).toContain("/ai/run/@cf/deepgram/aura-1");
			expect(call[1].headers.Authorization).toBe("Bearer key");

			// Verify body sent correctly
			const body = JSON.parse(call[1].body);
			expect(body.text).toBe("Hello world");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("generateSpeech via REST: throws on non-ok response", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response("Bad Request", { status: 400 })) as any;

		try {
			const adapter = new WorkersAiTTSAdapter(
				{ accountId: "abc", apiKey: "key" },
				"@cf/deepgram/aura-1",
			);

			await expect(
				adapter.generateSpeech({
					model: "@cf/deepgram/aura-1",
					text: "Hello",
				}),
			).rejects.toThrow(/Workers AI TTS request failed \(400\)/);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	// -----------------------------------------------------------------------
	// Gateway path
	// -----------------------------------------------------------------------

	it("generateSpeech via gateway: returns audio on success", async () => {
		const fakeBytes = new Uint8Array([0x49, 0x44, 0x33]);
		const mockGatewayFetch = vi
			.fn()
			.mockResolvedValue(new Response(fakeBytes, { status: 200 }));

		vi.resetModules();
		vi.doMock("../src/utils/create-fetcher", async (importOriginal) => {
			const actual = await importOriginal<typeof import("../src/utils/create-fetcher")>();
			return { ...actual, createGatewayFetch: () => mockGatewayFetch };
		});

		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");
		const adapter = new WorkersAiTTSAdapter(
			{ accountId: "abc", gatewayId: "gw", cfApiKey: "tok" },
			"@cf/deepgram/aura-1",
		);

		const result = await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello world",
		});

		expect(result.audio).toBeTruthy();
		expect(result.model).toBe("@cf/deepgram/aura-1");
		expect(mockGatewayFetch).toHaveBeenCalledOnce();

		// Verify gateway URL
		const call = mockGatewayFetch.mock.calls[0]!;
		expect(call[0]).toContain("/audio/speech");

		vi.doUnmock("../src/utils/create-fetcher");
	});

	it("generateSpeech via gateway: throws on non-ok response", async () => {
		const mockGatewayFetch = vi
			.fn()
			.mockResolvedValue(new Response("Gateway error", { status: 502 }));

		vi.resetModules();
		vi.doMock("../src/utils/create-fetcher", async (importOriginal) => {
			const actual = await importOriginal<typeof import("../src/utils/create-fetcher")>();
			return { ...actual, createGatewayFetch: () => mockGatewayFetch };
		});

		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");
		const adapter = new WorkersAiTTSAdapter(
			{ accountId: "abc", gatewayId: "gw", cfApiKey: "tok" },
			"@cf/deepgram/aura-1",
		);

		await expect(
			adapter.generateSpeech({
				model: "@cf/deepgram/aura-1",
				text: "Hello",
			}),
		).rejects.toThrow(/Workers AI TTS gateway request failed \(502\)/);

		vi.doUnmock("../src/utils/create-fetcher");
	});

	// -----------------------------------------------------------------------
	// Options passthrough
	// -----------------------------------------------------------------------

	it("passes voice and speed options to binding", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const fakeAudio = new Uint8Array([0x00]);
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeAudio),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTTSAdapter({ binding: mockBinding }, "@cf/deepgram/aura-1");

		await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello",
			voice: "asteria",
			speed: 1.5,
		});

		const callArgs = mockBinding.run.mock.calls[0]![1] as Record<string, unknown>;
		expect(callArgs.text).toBe("Hello");
		expect(callArgs.voice).toBe("asteria");
		expect(callArgs.speed).toBe(1.5);
	});

	it("respects format parameter", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const fakeAudio = new Uint8Array([0x00]);
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeAudio),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTTSAdapter({ binding: mockBinding }, "@cf/deepgram/aura-1");

		const result = await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello",
			format: "wav",
		});

		expect(result.format).toBe("wav");
		expect(result.contentType).toBe("audio/wav");
	});

	it("passes modelOptions to binding", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");

		const fakeAudio = new Uint8Array([0x00]);
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeAudio),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTTSAdapter({ binding: mockBinding }, "@cf/deepgram/aura-1");

		await adapter.generateSpeech({
			model: "@cf/deepgram/aura-1",
			text: "Hello",
			modelOptions: { sample_rate: 24000 },
		});

		const callArgs = mockBinding.run.mock.calls[0]![1] as Record<string, unknown>;
		expect(callArgs.sample_rate).toBe(24000);
	});

	// -----------------------------------------------------------------------
	// Properties + factory
	// -----------------------------------------------------------------------

	it("adapter has kind = 'tts'", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");
		const adapter = new WorkersAiTTSAdapter(
			{ accountId: "abc", apiKey: "key" },
			"@cf/deepgram/aura-1",
		);

		expect(adapter.kind).toBe("tts");
		expect(adapter.name).toBe("workers-ai-tts");
		expect(adapter.model).toBe("@cf/deepgram/aura-1");
	});

	it("createWorkersAiTts factory creates correct adapter", async () => {
		const { createWorkersAiTts } = await import("../src/adapters/workers-ai-tts");

		const adapter = createWorkersAiTts("@cf/deepgram/aura-1", {
			accountId: "abc",
			apiKey: "key",
		});

		expect(adapter.kind).toBe("tts");
		expect(adapter.model).toBe("@cf/deepgram/aura-1");
	});

	// -----------------------------------------------------------------------
	// Config validation
	// -----------------------------------------------------------------------

	it("throws for empty config (no binding, no credentials)", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");
		expect(() => new WorkersAiTTSAdapter({} as any, "@cf/deepgram/aura-1")).toThrow(
			/Invalid Workers AI configuration/,
		);
	});

	it("accepts an arbitrary model string", async () => {
		const { WorkersAiTTSAdapter } = await import("../src/adapters/workers-ai-tts");
		const mockBinding = {
			run: vi.fn().mockResolvedValue(new Uint8Array([0])),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiTTSAdapter(
			{ binding: mockBinding },
			"@cf/my-org/custom-tts-model",
		);
		expect(adapter).toBeDefined();
	});
});
