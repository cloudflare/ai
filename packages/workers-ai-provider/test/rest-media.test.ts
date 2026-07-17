import {
	generateSpeech,
	transcribe,
	generateImage,
	rerank,
} from "ai";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createWorkersAI } from "../src/index";

/**
 * REST-path coverage for the non-text Workers AI models (image / speech /
 * transcription / reranking). The offline suites for these only exercised the
 * binding path; the REST path was previously e2e-only (creds-gated, not in CI).
 *
 * The credentials shim hits `…/accounts/<id>/ai/run/<model>` and unwraps the
 * `{ result }` envelope — except TTS, which uses `returnRawResponse` and reads
 * the raw binary body.
 */
const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";

function runUrl(model: string) {
	return `https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${model}`;
}

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function workersai() {
	return createWorkersAI({ accountId: TEST_ACCOUNT_ID, apiKey: TEST_API_KEY });
}

describe("REST API - Image generation", () => {
	it("decodes a base64 image from the { result } envelope", async () => {
		const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header stub
		const model = "@cf/black-forest-labs/flux-1-schnell";
		let captured: Record<string, unknown> | null = null;

		server.use(
			http.post(runUrl(model), async ({ request }) => {
				captured = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					result: { image: Buffer.from(imageBytes).toString("base64") },
				});
			}),
		);

		const result = await generateImage({
			model: workersai().image(model),
			prompt: "A beautiful sunset",
			size: "512x512",
		});

		expect(result.images).toHaveLength(1);
		expect(result.images[0]!.uint8Array).toEqual(imageBytes);
		expect(captured).toMatchObject({ prompt: "A beautiful sunset", width: 512, height: 512 });
	});
});

describe("REST API - Speech (TTS)", () => {
	it("reads raw audio bytes from the returnRawResponse path", async () => {
		const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04]); // ID3 header stub
		const model = "@cf/deepgram/aura-1";

		server.use(
			http.post(runUrl(model), async () =>
				HttpResponse.arrayBuffer(audioBytes.buffer as ArrayBuffer, {
					headers: { "content-type": "audio/mpeg" },
				}),
			),
		);

		const result = await generateSpeech({
			model: workersai().speech(model),
			text: "Hello from REST",
		});

		expect(result.audio.uint8Array).toEqual(audioBytes);
	});

	it("forwards voice + speed in the REST body", async () => {
		const model = "@cf/deepgram/aura-1";
		let captured: Record<string, unknown> | null = null;

		server.use(
			http.post(runUrl(model), async ({ request }) => {
				captured = (await request.json()) as Record<string, unknown>;
				return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer as ArrayBuffer, {
					headers: { "content-type": "audio/mpeg" },
				});
			}),
		);

		await generateSpeech({
			model: workersai().speech(model),
			text: "hi",
			voice: "angus",
			speed: 1.2,
		});

		expect(captured).toMatchObject({ text: "hi", voice: "angus", speed: 1.2 });
	});
});

describe("REST API - Transcription (Whisper)", () => {
	it("transcribes audio and maps words to segments", async () => {
		const model = "@cf/openai/whisper";
		let captured: Record<string, unknown> | null = null;

		server.use(
			http.post(runUrl(model), async ({ request }) => {
				captured = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					result: {
						text: "Hello world",
						words: [
							{ word: "Hello", start: 0.0, end: 0.5 },
							{ word: "world", start: 0.6, end: 1.0 },
						],
					},
				});
			}),
		);

		const result = await transcribe({
			model: workersai().transcription(model),
			audio: new Uint8Array([0x52, 0x49, 0x46, 0x46]), // RIFF header stub
			mediaType: "audio/wav",
		});

		expect(result.text).toBe("Hello world");
		expect(result.segments).toHaveLength(2);
		expect(result.segments[0]!.text).toBe("Hello");
		// Whisper (non-turbo) ships audio as a number[] in the REST body.
		expect(Array.isArray((captured as Record<string, unknown>).audio)).toBe(true);
	});
});

describe("REST API - Reranking", () => {
	it("ranks documents from the { result.response } envelope", async () => {
		const model = "@cf/baai/bge-reranker-base";
		let captured: Record<string, unknown> | null = null;

		server.use(
			http.post(runUrl(model), async ({ request }) => {
				captured = (await request.json()) as Record<string, unknown>;
				return HttpResponse.json({
					result: {
						response: [
							{ id: 2, score: 0.95 },
							{ id: 0, score: 0.8 },
							{ id: 1, score: 0.3 },
						],
					},
				});
			}),
		);

		const result = await rerank({
			model: workersai().reranking(model),
			query: "What is machine learning?",
			documents: [
				"Machine learning is a subset of AI.",
				"The weather is nice today.",
				"Deep learning uses neural networks.",
			],
		});

		expect(result.ranking[0]!.originalIndex).toBe(2);
		expect(result.ranking[0]!.score).toBe(0.95);
		expect(captured).toMatchObject({ query: "What is machine learning?" });
	});
});
