import { describe, expect, it, vi } from "vitest";

describe("WorkersAiTranscriptionAdapter", () => {
	// -----------------------------------------------------------------------
	// Binding path
	// -----------------------------------------------------------------------

	it("transcribeViaBinding: returns standard TranscriptionResult", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");

		const mockResult = {
			text: "Hello world",
			words: [
				{ word: "Hello", start: 0.0, end: 0.5 },
				{ word: "world", start: 0.6, end: 1.0 },
			],
		};
		const mockBinding = {
			run: vi.fn().mockResolvedValue(mockResult),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTranscriptionAdapter(
			{ binding: mockBinding },
			"@cf/openai/whisper",
		);

		const result = await adapter.transcribe({
			model: "@cf/openai/whisper",
			audio: new ArrayBuffer(10),
		});

		expect(result).toHaveProperty("id");
		expect(result).toHaveProperty("model", "@cf/openai/whisper");
		expect(result.text).toBe("Hello world");
		expect(result.words).toHaveLength(2);
		expect(result.words![0]!.word).toBe("Hello");
	});

	it("transcribeViaBinding: handles whisper-large-v3-turbo with segments", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");

		const mockResult = {
			text: "This is a test transcription.",
			transcription_info: {
				language: "en",
				language_probability: 0.98,
				duration: 5.2,
			},
			segments: [
				{ text: "This is a test", start: 0.0, end: 2.5 },
				{ text: " transcription.", start: 2.5, end: 5.2 },
			],
		};
		const mockBinding = {
			run: vi.fn().mockResolvedValue(mockResult),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTranscriptionAdapter(
			{ binding: mockBinding },
			"@cf/openai/whisper-large-v3-turbo",
		);

		const result = await adapter.transcribe({
			model: "@cf/openai/whisper-large-v3-turbo",
			audio: new ArrayBuffer(10),
		});

		expect(result.text).toBe("This is a test transcription.");
		expect(result.language).toBe("en");
		expect(result.duration).toBe(5.2);
		expect(result.segments).toHaveLength(2);
		expect(result.segments![0]!.id).toBe(0);
		expect(result.segments![0]!.text).toBe("This is a test");
	});

	it("transcribeViaBinding: passes language and prompt options", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");

		const mockBinding = {
			run: vi.fn().mockResolvedValue({ text: "bonjour" }),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTranscriptionAdapter(
			{ binding: mockBinding },
			"@cf/openai/whisper",
		);

		await adapter.transcribe({
			model: "@cf/openai/whisper",
			audio: new ArrayBuffer(10),
			language: "fr",
			prompt: "This is French audio",
		});

		const callArgs = mockBinding.run.mock.calls[0]![1] as Record<string, unknown>;
		expect(callArgs.language).toBe("fr");
		expect(callArgs.initial_prompt).toBe("This is French audio");
	});

	// -----------------------------------------------------------------------
	// REST path
	// -----------------------------------------------------------------------

	it("transcribeViaRest: returns transcription on success", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ text: "Hello from REST" }), { status: 200 }),
			) as any;

		try {
			const adapter = new WorkersAiTranscriptionAdapter(
				{ accountId: "abc", apiKey: "key" },
				"@cf/openai/whisper",
			);

			const result = await adapter.transcribe({
				model: "@cf/openai/whisper",
				audio: new ArrayBuffer(10),
			});

			expect(result.text).toBe("Hello from REST");
			expect(result.model).toBe("@cf/openai/whisper");

			const call = (globalThis.fetch as any).mock.calls[0]!;
			expect(call[0]).toContain("/ai/run/@cf/openai/whisper");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("transcribeViaRest: sends base64 audio for whisper-large-v3-turbo", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ text: "turbo" }), { status: 200 }),
			) as any;

		try {
			const adapter = new WorkersAiTranscriptionAdapter(
				{ accountId: "abc", apiKey: "key" },
				"@cf/openai/whisper-large-v3-turbo",
			);

			await adapter.transcribe({
				model: "@cf/openai/whisper-large-v3-turbo",
				audio: new ArrayBuffer(4),
			});

			const call = (globalThis.fetch as any).mock.calls[0]!;
			const body = JSON.parse(call[1].body);
			// v3-turbo sends base64 string, not number array
			expect(typeof body.audio).toBe("string");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("transcribeViaRest: throws on non-ok response", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response("Model not found", { status: 404 })) as any;

		try {
			const adapter = new WorkersAiTranscriptionAdapter(
				{ accountId: "abc", apiKey: "key" },
				"@cf/openai/whisper",
			);

			await expect(
				adapter.transcribe({
					model: "@cf/openai/whisper",
					audio: new ArrayBuffer(10),
				}),
			).rejects.toThrow(/Workers AI transcription request failed \(404\)/);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	// -----------------------------------------------------------------------
	// Gateway path
	// -----------------------------------------------------------------------

	it("transcribeViaGateway: returns transcription on success", async () => {
		const mockGatewayFetch = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ text: "Hello from gateway" }), { status: 200 }),
			);

		vi.resetModules();
		vi.doMock("../src/utils/create-fetcher", async (importOriginal) => {
			const actual = await importOriginal<typeof import("../src/utils/create-fetcher")>();
			return { ...actual, createGatewayFetch: () => mockGatewayFetch };
		});

		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		const adapter = new WorkersAiTranscriptionAdapter(
			{ accountId: "abc", gatewayId: "gw", cfApiKey: "tok" },
			"@cf/openai/whisper",
		);

		const result = await adapter.transcribe({
			model: "@cf/openai/whisper",
			audio: new ArrayBuffer(10),
		});

		expect(result.text).toBe("Hello from gateway");
		expect(mockGatewayFetch).toHaveBeenCalledOnce();

		vi.doUnmock("../src/utils/create-fetcher");
	});

	it("transcribeViaGateway: throws on non-ok response", async () => {
		const mockGatewayFetch = vi
			.fn()
			.mockResolvedValue(new Response("Gateway error", { status: 502 }));

		vi.resetModules();
		vi.doMock("../src/utils/create-fetcher", async (importOriginal) => {
			const actual = await importOriginal<typeof import("../src/utils/create-fetcher")>();
			return { ...actual, createGatewayFetch: () => mockGatewayFetch };
		});

		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		const adapter = new WorkersAiTranscriptionAdapter(
			{ accountId: "abc", gatewayId: "gw", cfApiKey: "tok" },
			"@cf/openai/whisper",
		);

		await expect(
			adapter.transcribe({
				model: "@cf/openai/whisper",
				audio: new ArrayBuffer(10),
			}),
		).rejects.toThrow(/Workers AI transcription gateway request failed \(502\)/);

		vi.doUnmock("../src/utils/create-fetcher");
	});

	// -----------------------------------------------------------------------
	// Audio normalization
	// -----------------------------------------------------------------------

	it("normalizes base64 string audio input", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");

		const mockBinding = {
			run: vi.fn().mockResolvedValue({ text: "hello" }),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTranscriptionAdapter(
			{ binding: mockBinding },
			"@cf/openai/whisper",
		);

		const b64Audio = btoa("test");
		await adapter.transcribe({ model: "@cf/openai/whisper", audio: b64Audio });

		const callArgs = mockBinding.run.mock.calls[0]![1] as Record<string, unknown>;
		expect(callArgs.audio).toBeInstanceOf(Array);
		expect((callArgs.audio as number[]).length).toBe(4);
	});

	it("normalizes Blob audio input", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");

		const mockBinding = {
			run: vi.fn().mockResolvedValue({ text: "hello" }),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTranscriptionAdapter(
			{ binding: mockBinding },
			"@cf/openai/whisper",
		);

		const blob = new Blob([new Uint8Array([1, 2, 3])]);
		await adapter.transcribe({ model: "@cf/openai/whisper", audio: blob });

		const callArgs = mockBinding.run.mock.calls[0]![1] as Record<string, unknown>;
		expect(callArgs.audio).toBeInstanceOf(Array);
		expect(callArgs.audio as number[]).toEqual([1, 2, 3]);
	});

	it("normalizes ArrayBuffer audio input", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");

		const mockBinding = {
			run: vi.fn().mockResolvedValue({ text: "hello" }),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};

		const adapter = new WorkersAiTranscriptionAdapter(
			{ binding: mockBinding },
			"@cf/openai/whisper",
		);

		const buffer = new Uint8Array([10, 20, 30]).buffer;
		await adapter.transcribe({ model: "@cf/openai/whisper", audio: buffer });

		const callArgs = mockBinding.run.mock.calls[0]![1] as Record<string, unknown>;
		expect(callArgs.audio).toBeInstanceOf(Array);
		expect(callArgs.audio as number[]).toEqual([10, 20, 30]);
	});

	// -----------------------------------------------------------------------
	// Properties + factory
	// -----------------------------------------------------------------------

	it("adapter has kind = 'transcription'", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		const adapter = new WorkersAiTranscriptionAdapter(
			{ accountId: "abc", apiKey: "key" },
			"@cf/openai/whisper",
		);

		expect(adapter.kind).toBe("transcription");
		expect(adapter.name).toBe("workers-ai-transcription");
		expect(adapter.model).toBe("@cf/openai/whisper");
	});

	it("createWorkersAiTranscription factory creates correct adapter", async () => {
		const { createWorkersAiTranscription } =
			await import("../src/adapters/workers-ai-transcription");
		const adapter = createWorkersAiTranscription("@cf/deepgram/nova-3", {
			accountId: "abc",
			apiKey: "key",
		});

		expect(adapter.kind).toBe("transcription");
		expect(adapter.model).toBe("@cf/deepgram/nova-3");
	});

	// -----------------------------------------------------------------------
	// Config validation
	// -----------------------------------------------------------------------

	it("throws for empty config (no binding, no credentials)", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		expect(() => new WorkersAiTranscriptionAdapter({} as any, "@cf/openai/whisper")).toThrow(
			/Invalid Workers AI configuration/,
		);
	});

	it("accepts an arbitrary model string", async () => {
		const { WorkersAiTranscriptionAdapter } =
			await import("../src/adapters/workers-ai-transcription");
		const mockBinding = {
			run: vi.fn().mockResolvedValue({ text: "hello" }),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiTranscriptionAdapter(
			{ binding: mockBinding },
			"@cf/my-org/custom-whisper",
		);
		expect(adapter).toBeDefined();
	});
});
