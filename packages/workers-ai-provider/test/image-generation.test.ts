import { experimental_generateImage as generateImage } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createWorkersAI } from "../src/index";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

// Base64 encoded 1x1 red PNG for testing
const TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

const imageGenerationHandler = http.post(
	`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_IMAGE_MODEL}`,
	async () => {
		return HttpResponse.json({ result: { image: TEST_IMAGE_BASE64 } });
	},
);

const server = setupServer(imageGenerationHandler);

describe("REST API - Image Generation Tests", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should generate an image", async () => {
		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const result = await generateImage({
			model: workersai.image(TEST_IMAGE_MODEL),
			prompt: "A futuristic city",
			size: "512x512",
		});

		expect(result.images).toHaveLength(1);
		expect(result.images[0].uint8Array).toBeInstanceOf(Uint8Array);
		expect(result.images[0].uint8Array.length).toBeGreaterThan(0);
	});
});

describe("Binding - Image Generation Tests", () => {
	it("should handle Uint8Array output directly", async () => {
		const expectedData = new Uint8Array([1, 2, 3, 4, 5]);

		const workersai = createWorkersAI({
			binding: {
				run: async () => expectedData,
			},
		});

		const result = await generateImage({
			model: workersai.image(TEST_IMAGE_MODEL),
			prompt: "test image",
			size: "512x512",
		});

		expect(result.images).toHaveLength(1);
		expect(result.images[0].uint8Array).toEqual(expectedData);
	});

	it("should handle ArrayBuffer output", async () => {
		const data = new Uint8Array([10, 20, 30, 40]);

		const workersai = createWorkersAI({
			binding: {
				run: async () => data.buffer,
			},
		});

		const result = await generateImage({
			model: workersai.image(TEST_IMAGE_MODEL),
			prompt: "test image",
			size: "256x256",
		});

		expect(result.images).toHaveLength(1);
		expect(result.images[0].uint8Array).toEqual(data);
	});

	it("should handle ReadableStream output", async () => {
		const chunk1 = new Uint8Array([1, 2, 3]);
		const chunk2 = new Uint8Array([4, 5, 6]);
		const expectedResult = new Uint8Array([1, 2, 3, 4, 5, 6]);

		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					return new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(chunk1);
							controller.enqueue(chunk2);
							controller.close();
						},
					});
				},
			},
		});

		const result = await generateImage({
			model: workersai.image(TEST_IMAGE_MODEL),
			prompt: "test image",
			size: "512x512",
		});

		expect(result.images).toHaveLength(1);
		expect(result.images[0].uint8Array).toEqual(expectedResult);
	});

	it("should handle base64 image response (REST API format)", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => ({ image: TEST_IMAGE_BASE64 }),
			},
		});

		const result = await generateImage({
			model: workersai.image(TEST_IMAGE_MODEL),
			prompt: "test image",
			size: "512x512",
		});

		expect(result.images).toHaveLength(1);
		expect(result.images[0].uint8Array).toBeInstanceOf(Uint8Array);
		expect(result.images[0].uint8Array.length).toBeGreaterThan(0);
	});
});
