import { APICallError } from "@ai-sdk/provider";
import { transcribe } from "ai";
import { describe, expect, it } from "vitest";
import { createWorkersAI } from "../src/index";

// ---------------------------------------------------------------------------
// Whisper models
// ---------------------------------------------------------------------------

describe("Transcription - Whisper", () => {
	it("should transcribe audio via binding (Uint8Array)", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return {
						text: "Hello world",
						words: [
							{ word: "Hello", start: 0.0, end: 0.5 },
							{ word: "world", start: 0.6, end: 1.0 },
						],
					};
				},
			},
		});

		const result = await transcribe({
			model: workersai.transcription("@cf/openai/whisper"),
			audio: new Uint8Array([0x52, 0x49, 0x46, 0x46]), // RIFF header stub
			mediaType: "audio/wav",
		});

		expect(result.text).toBe("Hello world");
		expect(result.segments).toHaveLength(2);
		expect(result.segments[0].text).toBe("Hello");
		expect(result.segments[0].startSecond).toBe(0.0);
		expect(result.segments[0].endSecond).toBe(0.5);

		// Audio should be sent as number[]
		expect(capturedInputs.audio).toBeInstanceOf(Array);
		expect(capturedInputs.audio).toEqual([0x52, 0x49, 0x46, 0x46]);
	});

	it("should transcribe audio from base64 string", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return { text: "decoded" };
				},
			},
		});

		// Base64 of bytes [0x48, 0x69] = "Hi"
		const b64Audio = btoa("Hi");

		const result = await transcribe({
			model: workersai.transcription("@cf/openai/whisper"),
			audio: b64Audio,
			mediaType: "audio/wav",
		});

		expect(result.text).toBe("decoded");
		// Should decode base64 and send as number[]
		expect(capturedInputs.audio).toEqual([0x48, 0x69]);
	});

	it("should pass language and prompt settings", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return { text: "bonjour" };
				},
			},
		});

		await transcribe({
			model: workersai.transcription("@cf/openai/whisper", {
				language: "fr",
				prompt: "French audio",
			}),
			audio: new Uint8Array([1]),
			mediaType: "audio/wav",
		});

		expect(capturedInputs.language).toBe("fr");
		expect(capturedInputs.initial_prompt).toBe("French audio");
	});

	it("should normalize whisper-large-v3-turbo segments and transcription_info", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => ({
					text: "This is a test.",
					transcription_info: { language: "en", duration: 5.2 },
					segments: [
						{ text: "This is", start: 0.0, end: 2.5 },
						{ text: " a test.", start: 2.5, end: 5.2 },
					],
				}),
			},
		});

		const result = await transcribe({
			model: workersai.transcription("@cf/openai/whisper-large-v3-turbo"),
			audio: new Uint8Array([1]),
			mediaType: "audio/wav",
		});

		expect(result.text).toBe("This is a test.");
		expect(result.language).toBe("en");
		expect(result.durationInSeconds).toBe(5.2);
		expect(result.segments).toHaveLength(2);
		expect(result.segments[0].startSecond).toBe(0.0);
		expect(result.segments[1].endSecond).toBe(5.2);
	});

	it("should throw NoTranscriptGeneratedError for empty transcription", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => ({ text: "" }),
			},
		});

		await expect(
			transcribe({
				model: workersai.transcription("@cf/openai/whisper"),
				audio: new Uint8Array([1]),
				mediaType: "audio/wav",
			}),
		).rejects.toThrow(/No transcript generated/);
	});
});

// ---------------------------------------------------------------------------
// Deepgram Nova-3
// ---------------------------------------------------------------------------

describe("Transcription - Deepgram Nova-3", () => {
	it("should transcribe with Nova-3 format via binding", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return {
						results: {
							channels: [
								{
									alternatives: [
										{
											transcript: "Hello from Nova",
											confidence: 0.99,
											words: [
												{ word: "Hello", start: 0.0, end: 0.4 },
												{ word: "from", start: 0.5, end: 0.7 },
												{ word: "Nova", start: 0.8, end: 1.1 },
											],
										},
									],
								},
							],
						},
					};
				},
			},
		});

		const result = await transcribe({
			model: workersai.transcription("@cf/deepgram/nova-3"),
			audio: new Uint8Array([1, 2, 3]),
			mediaType: "audio/wav",
		});

		expect(result.text).toBe("Hello from Nova");
		expect(result.segments).toHaveLength(3);
		expect(result.segments[0].text).toBe("Hello");
		expect(result.segments[2].text).toBe("Nova");
		expect(result.segments[2].endSecond).toBe(1.1);

		// Nova-3 should receive { audio: { body: base64, contentType } }
		expect(capturedInputs.audio).toBeDefined();
		expect(capturedInputs.audio.body).toBeDefined();
		expect(capturedInputs.audio.contentType).toBe("audio/wav");
	});

	it("should throw NoTranscriptGeneratedError for empty Nova-3 response", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => ({
					results: {
						channels: [
							{
								alternatives: [{ transcript: "", confidence: 0, words: [] }],
							},
						],
					},
				}),
			},
		});

		await expect(
			transcribe({
				model: workersai.transcription("@cf/deepgram/nova-3"),
				audio: new Uint8Array([1]),
				mediaType: "audio/wav",
			}),
		).rejects.toThrow(/No transcript generated/);
	});
});

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

describe("Transcription - Provider", () => {
	it("transcriptionModel() is an alias for transcription()", () => {
		const workersai = createWorkersAI({
			binding: { run: async () => ({}) },
		});

		const t1 = workersai.transcription("@cf/openai/whisper");
		const t2 = workersai.transcriptionModel("@cf/openai/whisper");

		expect(t1.modelId).toBe(t2.modelId);
		expect(t1.provider).toBe("workersai.transcription");
	});

	it("normalizes an out-of-capacity binding error to a retryable 429 APICallError", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					throw new Error("3040: Capacity temporarily exceeded, please try again.");
				},
			} as any,
		});

		const err = await transcribe({
			model: workersai.transcription("@cf/openai/whisper"),
			audio: new Uint8Array([0x52, 0x49, 0x46, 0x46]),
			mediaType: "audio/wav",
			maxRetries: 0,
		}).catch((e) => e);

		expect(APICallError.isInstance(err)).toBe(true);
		expect((err as APICallError).statusCode).toBe(429);
		expect((err as APICallError).isRetryable).toBe(true);
	});
});
