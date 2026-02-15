import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// WorkersAiImageAdapter
// ---------------------------------------------------------------------------

describe("WorkersAiImageAdapter", () => {
	// -----------------------------------------------------------------------
	// Binding path
	// -----------------------------------------------------------------------

	it("generateViaBinding: handles Uint8Array result", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const fakeImage = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeImage),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiImageAdapter(
			{ binding: mockBinding },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		const result = await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "a cat",
		});

		expect(result.images).toHaveLength(1);
		const img = result.images[0]!;
		expect(img.b64Json).toBeTruthy();
		const decoded = atob(img.b64Json!);
		expect(decoded.charCodeAt(0)).toBe(137); // PNG magic byte
	});

	it("generateViaBinding: handles ArrayBuffer result", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const fakeImage = new Uint8Array([0xff, 0xd8, 0xff]).buffer; // JPEG as ArrayBuffer
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeImage),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiImageAdapter(
			{ binding: mockBinding },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		const result = await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "a cat",
		});

		expect(result.images).toHaveLength(1);
		const decoded = atob(result.images[0]!.b64Json!);
		expect(decoded.charCodeAt(0)).toBe(0xff);
	});

	it("generateViaBinding: handles ReadableStream result", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const chunk1 = new Uint8Array([137, 80]);
		const chunk2 = new Uint8Array([78, 71]);
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
		const adapter = new WorkersAiImageAdapter(
			{ binding: mockBinding },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		const result = await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "a cat",
		});

		expect(result.images).toHaveLength(1);
		const decoded = atob(result.images[0]!.b64Json!);
		expect(decoded.length).toBe(4);
		expect(decoded.charCodeAt(0)).toBe(137);
	});

	it("generateViaBinding: handles { image: base64 } result", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const b64 = btoa("fake-image");
		const mockBinding = {
			run: vi.fn().mockResolvedValue({ image: b64 }),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiImageAdapter(
			{ binding: mockBinding },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		const result = await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "a cat",
		});

		expect(result.images[0]!.b64Json).toBe(b64);
	});

	it("generateViaBinding: throws on unexpected format", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const mockBinding = {
			run: vi.fn().mockResolvedValue("unexpected string"),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiImageAdapter(
			{ binding: mockBinding },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		await expect(
			adapter.generateImages({
				model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
				prompt: "a cat",
			}),
		).rejects.toThrow(/Unexpected binary response format/);
	});

	// -----------------------------------------------------------------------
	// REST path
	// -----------------------------------------------------------------------

	it("generateViaRest: returns image on success", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const fakeBytes = new Uint8Array([137, 80, 78, 71]);
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response(fakeBytes, { status: 200 })) as any;

		try {
			const adapter = new WorkersAiImageAdapter(
				{ accountId: "abc", apiKey: "key" },
				"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
			);

			const result = await adapter.generateImages({
				model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
				prompt: "a cat",
			});

			expect(result.images).toHaveLength(1);
			expect(result.images[0]!.b64Json).toBeTruthy();
			expect(result.model).toBe("@cf/stabilityai/stable-diffusion-xl-base-1.0");

			// Verify correct URL and headers
			const call = (globalThis.fetch as any).mock.calls[0]!;
			expect(call[0]).toContain("/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0");
			expect(call[1].headers.Authorization).toBe("Bearer key");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("generateViaRest: throws on non-ok response", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const originalFetch = globalThis.fetch;
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response("Model not found", { status: 404 })) as any;

		try {
			const adapter = new WorkersAiImageAdapter(
				{ accountId: "abc", apiKey: "key" },
				"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
			);

			await expect(
				adapter.generateImages({
					model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
					prompt: "a cat",
				}),
			).rejects.toThrow(/Workers AI image request failed \(404\)/);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	// -----------------------------------------------------------------------
	// Gateway path
	// -----------------------------------------------------------------------

	it("generateViaGateway: returns image on success", async () => {
		const fakeBytes = new Uint8Array([137, 80, 78, 71]);
		const mockGatewayFetch = vi
			.fn()
			.mockResolvedValue(new Response(fakeBytes, { status: 200 }));

		vi.resetModules();
		vi.doMock("../src/utils/create-fetcher", async (importOriginal) => {
			const actual = await importOriginal<typeof import("../src/utils/create-fetcher")>();
			return { ...actual, createGatewayFetch: () => mockGatewayFetch };
		});

		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const adapter = new WorkersAiImageAdapter(
			{ accountId: "abc", gatewayId: "gw", cfApiKey: "tok" },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		const result = await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "a cat",
		});

		expect(result.images).toHaveLength(1);
		expect(result.images[0]!.b64Json).toBeTruthy();
		expect(mockGatewayFetch).toHaveBeenCalledOnce();

		vi.doUnmock("../src/utils/create-fetcher");
	});

	it("generateViaGateway: throws on non-ok response", async () => {
		const mockGatewayFetch = vi
			.fn()
			.mockResolvedValue(new Response("Gateway error", { status: 502 }));

		vi.resetModules();
		vi.doMock("../src/utils/create-fetcher", async (importOriginal) => {
			const actual = await importOriginal<typeof import("../src/utils/create-fetcher")>();
			return { ...actual, createGatewayFetch: () => mockGatewayFetch };
		});

		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const adapter = new WorkersAiImageAdapter(
			{ accountId: "abc", gatewayId: "gw", cfApiKey: "tok" },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		await expect(
			adapter.generateImages({
				model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
				prompt: "a cat",
			}),
		).rejects.toThrow(/Workers AI image gateway request failed \(502\)/);

		vi.doUnmock("../src/utils/create-fetcher");
	});

	// -----------------------------------------------------------------------
	// Standard shape + properties
	// -----------------------------------------------------------------------

	it("generateImages returns standard ImageGenerationResult shape", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const fakeImage = new Uint8Array([0xff, 0xd8, 0xff]);
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeImage),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiImageAdapter(
			{ binding: mockBinding },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		const result = await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "a dog",
		});

		expect(result).toHaveProperty("id");
		expect(result).toHaveProperty("model");
		expect(result).toHaveProperty("images");
		expect(result.model).toBe("@cf/stabilityai/stable-diffusion-xl-base-1.0");
		expect(result.images).toBeInstanceOf(Array);
		expect(result.images).toHaveLength(1);
		expect(result.images[0]).toHaveProperty("b64Json");
	});

	it("adapter has kind = 'image'", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const adapter = new WorkersAiImageAdapter(
			{ accountId: "abc", apiKey: "key" },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		expect(adapter.kind).toBe("image");
		expect(adapter.name).toBe("workers-ai-image");
		expect(adapter.model).toBe("@cf/stabilityai/stable-diffusion-xl-base-1.0");
	});

	it("createWorkersAiImage factory function creates correct adapter", async () => {
		const { createWorkersAiImage } = await import("../src/adapters/workers-ai-image");
		const adapter = createWorkersAiImage(
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
			{ accountId: "abc", apiKey: "key" },
		);

		expect(adapter.kind).toBe("image");
		expect(adapter.model).toBe("@cf/stabilityai/stable-diffusion-xl-base-1.0");
	});

	it("passes size and modelOptions to binding", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const fakeImage = new Uint8Array([137, 80, 78, 71]);
		const mockBinding = {
			run: vi.fn().mockResolvedValue(fakeImage),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiImageAdapter(
			{ binding: mockBinding },
			"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
		);

		await adapter.generateImages({
			model: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
			prompt: "a cat",
			size: "512x512",
			modelOptions: { num_steps: 4, guidance: 7.5 },
		});

		const callArgs = mockBinding.run.mock.calls[0]![1] as Record<string, unknown>;
		expect(callArgs.prompt).toBe("a cat");
		expect(callArgs.width).toBe(512);
		expect(callArgs.height).toBe(512);
		// num_steps is a diffusion quality parameter, not "number of images"
		// — it's passed through modelOptions, not mapped from numberOfImages
		expect(callArgs.num_steps).toBe(4);
		expect(callArgs.guidance).toBe(7.5);
	});

	// -----------------------------------------------------------------------
	// Config validation
	// -----------------------------------------------------------------------

	it("throws for empty config (no binding, no credentials)", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		expect(
			() =>
				new WorkersAiImageAdapter(
					{} as any,
					"@cf/stabilityai/stable-diffusion-xl-base-1.0" as any,
				),
		).toThrow(/Invalid Workers AI configuration/);
	});

	it("accepts an arbitrary model string", async () => {
		const { WorkersAiImageAdapter } = await import("../src/adapters/workers-ai-image");
		const mockBinding = {
			run: vi.fn().mockResolvedValue(new Uint8Array([0])),
			gateway: () => ({ run: () => Promise.resolve(new Response("ok")) }),
		};
		const adapter = new WorkersAiImageAdapter(
			{ binding: mockBinding },
			"@cf/my-org/custom-image-model",
		);
		expect(adapter).toBeDefined();
	});
});
