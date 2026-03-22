/**
 * E2E tests for Workers AI via REST API.
 *
 * These tests call the real Cloudflare Workers AI API. They require valid
 * credentials in a `.env` file at the package root:
 *
 *   CLOUDFLARE_ACCOUNT_ID=<your account id>
 *   CLOUDFLARE_API_TOKEN=<your API token with Workers AI access>
 *
 * Run with: pnpm test:e2e:rest
 *
 * These are excluded from the default `pnpm test` / `pnpm test:ci` runs.
 */
import { afterAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import {
	generateText,
	streamText,
	stepCountIs,
	Output,
	generateImage,
	embedMany,
	experimental_transcribe as transcribe,
	experimental_generateSpeech as generateSpeech,
	rerank,
} from "ai";
import { z } from "zod/v4";
import { createWorkersAI } from "../../src/index";

// Load env vars from .env at package root
config({ path: new URL("../../.env", import.meta.url).pathname });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function skip() {
	return !ACCOUNT_ID || !API_TOKEN;
}

function makeProvider() {
	return createWorkersAI({
		accountId: ACCOUNT_ID!,
		apiKey: API_TOKEN!,
	});
}

// ---------------------------------------------------------------------------
// Models to test
// ---------------------------------------------------------------------------

const MODELS = [
	// Recommended models
	{ id: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
	{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B" },
	{ id: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B" },
	{ id: "@cf/qwen/qwq-32b", label: "QwQ 32B (reasoning)" },
	// Other popular models
	{ id: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast" },
	{ id: "@cf/openai/gpt-oss-20b", label: "GPT-OSS 20B" },
	{ id: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B" },
	{ id: "@cf/moonshotai/kimi-k2.5", label: "Kimi K2.5" },
] as const;

type ModelId = (typeof MODELS)[number]["id"];

// ---------------------------------------------------------------------------
// Results tracker
// ---------------------------------------------------------------------------

type Status = "ok" | "warn" | "fail" | "skip";

const results: Record<
	string,
	{
		chat: Status;
		multiTurn: Status;
		toolCalling: Status;
		toolRoundTrip: Status;
		toolMultiStep: Status;
		toolRequired: Status;
		structuredOutput: Status;
		notes: string[];
	}
> = {};

function getResult(label: string) {
	if (!results[label]) {
		results[label] = {
			chat: "skip",
			multiTurn: "skip",
			toolCalling: "skip",
			toolRoundTrip: "skip",
			toolMultiStep: "skip",
			toolRequired: "skip",
			structuredOutput: "skip",
			notes: [],
		};
	}
	return results[label];
}

function statusIcon(s: Status): string {
	switch (s) {
		case "ok":
			return "  OK";
		case "warn":
			return "  ~ ";
		case "fail":
			return "  X ";
		case "skip":
			return "  - ";
	}
}

function printSummaryTable() {
	const labels = Object.keys(results);
	if (labels.length === 0) return;

	const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
	const maxLabel = Math.max(...labels.map((l) => l.length), 5);

	const header = `${pad("Model", maxLabel)} | Chat | Turn | Tool | T-RT | T-MS | T-Rq | JSON | Notes`;
	const sep = "-".repeat(header.length + 10);

	console.log(`\n${sep}`);
	console.log("  WORKERS AI REST API — E2E RESULTS");
	console.log(sep);
	console.log(header);
	console.log(sep);

	for (const label of labels) {
		const r = results[label];
		const notes = r.notes.length > 0 ? r.notes.join("; ") : "";
		console.log(
			`${pad(label, maxLabel)} | ${statusIcon(r.chat)} | ${statusIcon(r.multiTurn)} | ${statusIcon(r.toolCalling)} | ${statusIcon(r.toolRoundTrip)} | ${statusIcon(r.toolMultiStep)} | ${statusIcon(r.toolRequired)} | ${statusIcon(r.structuredOutput)} | ${notes}`,
		);
	}

	console.log(sep);
	console.log("  OK = works    ~ = partial/quirky    X = broken    - = skipped");
	console.log("  T-MS = multi-step agentic loop    T-Rq = toolChoice required");
	console.log(`${sep}\n`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(skip())("Workers AI REST E2E", () => {
	afterAll(() => {
		printSummaryTable();
	});

	// ------------------------------------------------------------------
	// Basic chat (per model)
	// ------------------------------------------------------------------
	describe("basic chat", () => {
		for (const model of MODELS) {
			it(`${model.label} — streaming chat`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();
					const result = streamText({
						model: provider(model.id as ModelId),
						messages: [{ role: "user", content: "Say hello in one sentence." }],
					});

					let text = "";
					for await (const chunk of result.textStream) {
						text += chunk;
					}

					if (text.length > 0) {
						r.chat = "ok";
					} else {
						r.chat = "warn";
						r.notes.push("chat: empty response");
					}
				} catch (err: unknown) {
					r.chat = "fail";
					r.notes.push(`chat: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Multi-turn conversation (per model)
	// ------------------------------------------------------------------
	describe("multi-turn", () => {
		for (const model of MODELS) {
			it(`${model.label} — remembers context`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();
					const { text } = await generateText({
						model: provider(model.id as ModelId),
						messages: [
							{ role: "user", content: "My name is Alice." },
							{ role: "assistant", content: "Hello Alice! Nice to meet you." },
							{ role: "user", content: "What is my name?" },
						],
					});

					if (text.toLowerCase().includes("alice")) {
						r.multiTurn = "ok";
					} else {
						r.multiTurn = "warn";
						r.notes.push("turn: forgot context");
					}
				} catch (err: unknown) {
					r.multiTurn = "fail";
					r.notes.push(`turn: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Tool calling (per model)
	// ------------------------------------------------------------------
	describe("tool calling", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool calling`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();
					const result = await generateText({
						model: provider(model.id as ModelId),
						messages: [
							{
								role: "user",
								content:
									"What is 123 + 456? You MUST use the calculator tool to answer.",
							},
						],
						tools: {
							calculator: {
								description:
									"Add two numbers. Returns their sum. Always use this tool for math.",
								inputSchema: z.object({
									a: z.number().describe("First number"),
									b: z.number().describe("Second number"),
								}),
							},
						},
					});

					if (result.toolCalls && result.toolCalls.length > 0) {
						r.toolCalling = "ok";
					} else if (result.text.length > 0) {
						r.toolCalling = "warn";
						r.notes.push("tool: answered as text");
					} else {
						r.toolCalling = "fail";
						r.notes.push("tool: empty response");
					}
				} catch (err: unknown) {
					r.toolCalling = "fail";
					r.notes.push(`tool: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Tool round-trip (per model)
	// Uses maxSteps so the SDK handles the full round-trip:
	//   user asks -> model calls tool -> tool executes -> model responds with text
	// ------------------------------------------------------------------
	describe("tool round-trip", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool result round-trip`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();

					const result = await generateText({
						model: provider(model.id as ModelId),
						messages: [
							{
								role: "user",
								content:
									"What time is it? Use the get_current_time tool to find out.",
							},
						],
						tools: {
							get_current_time: {
								description:
									"Get the current UTC time. Always use this tool when asked about the time.",
								inputSchema: z.object({}),
								execute: async () => ({
									time: "2026-02-10T15:30:00.000Z",
								}),
							},
						},
						stopWhen: stepCountIs(2),
					});

					// Check if tool was called (step count > 1 means round-trip happened)
					if (result.steps.length > 1 && result.text.length > 0) {
						r.toolRoundTrip = "ok";
					} else if (result.toolCalls && result.toolCalls.length > 0) {
						// Tool was called but model didn't produce text after result
						r.toolRoundTrip = "warn";
						r.notes.push("t-rt: tool called but no final text");
					} else if (result.text.length > 0) {
						r.toolRoundTrip = "warn";
						r.notes.push("t-rt: skipped tool, answered directly");
					} else {
						r.toolRoundTrip = "fail";
						r.notes.push("t-rt: no tool call or content");
					}
				} catch (err: unknown) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Multi-step agentic tool loop (per model)
	// Exercises the tool result unwrapping fix: the model must correctly
	// read the first tool result to decide to make a second tool call.
	// ------------------------------------------------------------------
	describe("tool multi-step agentic loop", () => {
		for (const model of MODELS) {
			it(`${model.label} — multi-step tool loop`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();

					const result = await generateText({
						model: provider(model.id as ModelId),
						messages: [
							{
								role: "user",
								content:
									"I need two calculations done separately. First, what is 2 + 3? Second, what is 10 + 20? You MUST use the calculator tool for EACH calculation. Do NOT do math in your head.",
							},
						],
						tools: {
							calculator: {
								description:
									"Add two numbers together. Returns their sum. You MUST use this tool for every math operation.",
								inputSchema: z.object({
									a: z.number().describe("first number"),
									b: z.number().describe("second number"),
								}),
								execute: async ({ a, b }) => ({
									result: a + b,
								}),
							},
						},
						stopWhen: stepCountIs(4),
					});

					const toolCallCount = result.steps.reduce(
						(sum, step) => sum + (step.toolCalls?.length || 0),
						0,
					);

					if (toolCallCount >= 2 && result.text.length > 0) {
						r.toolMultiStep = "ok";
					} else if (toolCallCount >= 1) {
						r.toolMultiStep = "warn";
						r.notes.push(
							`t-ms: only ${toolCallCount} tool call(s), ${result.steps.length} step(s)`,
						);
					} else if (result.text.length > 0) {
						r.toolMultiStep = "warn";
						r.notes.push("t-ms: skipped tools, answered directly");
					} else {
						r.toolMultiStep = "fail";
						r.notes.push("t-ms: empty response");
					}
				} catch (err: unknown) {
					r.toolMultiStep = "fail";
					r.notes.push(`t-ms: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// toolChoice: "required" (per model)
	// Validates the tool_choice mapping fix: "required" must not be
	// sent as "any" (which causes 8001: Invalid input on vLLM models).
	// ------------------------------------------------------------------
	describe("toolChoice required", () => {
		for (const model of MODELS) {
			it(`${model.label} — toolChoice required`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();

					const result = await generateText({
						model: provider(model.id as ModelId),
						messages: [
							{
								role: "user",
								content: "What is 7 + 8? You MUST use the calculator tool.",
							},
						],
						tools: {
							calculator: {
								description: "Add two numbers. Returns their sum.",
								inputSchema: z.object({
									a: z.number().describe("first number"),
									b: z.number().describe("second number"),
								}),
							},
						},
						toolChoice: "required",
					});

					if (result.toolCalls && result.toolCalls.length > 0) {
						r.toolRequired = "ok";
					} else if (result.text.length > 0) {
						r.toolRequired = "warn";
						r.notes.push("t-rq: answered as text despite required");
					} else {
						r.toolRequired = "fail";
						r.notes.push("t-rq: no tool call or content");
					}
				} catch (err: unknown) {
					r.toolRequired = "fail";
					r.notes.push(`t-rq: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Structured output (per model)
	// ------------------------------------------------------------------
	describe("structured output", () => {
		for (const model of MODELS) {
			it(`${model.label} — structured output`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();
					const result = await generateText({
						model: provider(model.id as ModelId),
						prompt: "What is the capital of France and its approximate population in millions?",
						output: Output.object({
							schema: z.object({
								capital: z.string(),
								population_millions: z.number(),
							}),
						}),
					});

					const object = result.output;
					if (
						object &&
						typeof object.capital === "string" &&
						typeof object.population_millions === "number"
					) {
						r.structuredOutput = "ok";
					} else {
						r.structuredOutput = "warn";
						r.notes.push("json: wrong shape");
					}
				} catch (err: unknown) {
					r.structuredOutput = "fail";
					r.notes.push(`json: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Vision — image input
	// ------------------------------------------------------------------
	describe("vision — image input", () => {
		const VISION_MODELS = [
			{ id: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
			{ id: "@cf/moonshotai/kimi-k2.5", label: "Kimi K2.5" },
		] as const;

		function createTestPng(): Uint8Array {
			const base64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
			return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		}

		for (const model of VISION_MODELS) {
			it(`${model.label} — vision via REST`, async () => {
				const provider = makeProvider();
				const imageData = createTestPng();

				const result = await generateText({
					model: provider(model.id as ModelId),
					messages: [
						{
							role: "user",
							content: [
								{
									type: "text",
									text: "Describe what you see in this image in one short sentence.",
								},
								{
									type: "image",
									image: imageData,
								},
							],
						},
					],
				});

				expect(typeof result.text).toBe("string");
				expect(result.text.length).toBeGreaterThan(0);
				// The model should describe what it sees, not say "I don't see an image"
				expect(result.text.toLowerCase()).not.toContain("don't see an image");
				expect(result.text.toLowerCase()).not.toContain("no image attached");
				console.log(`  [vision] ${model.label} OK — "${result.text.slice(0, 100)}"`);
			});
		}
	});

	// ------------------------------------------------------------------
	// Image generation
	// ------------------------------------------------------------------
	describe("image generation", () => {
		it("Flux 1 Schnell — should generate an image", async () => {
			const provider = makeProvider();

			const result = await generateImage({
				model: provider.image("@cf/black-forest-labs/flux-1-schnell"),
				prompt: "A cute cartoon cat sitting on a grassy hill under a blue sky",
				size: "256x256",
			});

			expect(result.images).toHaveLength(1);
			expect(result.images[0].uint8Array.length).toBeGreaterThan(100);
			console.log(
				`  [image] Flux 1 Schnell OK — ${result.images[0].uint8Array.length} bytes`,
			);
		});
	});

	// ------------------------------------------------------------------
	// Embeddings
	// ------------------------------------------------------------------
	describe("embeddings", () => {
		it("BGE Base EN — should generate embeddings", async () => {
			const provider = makeProvider();

			const result = await embedMany({
				model: provider.textEmbedding("@cf/baai/bge-base-en-v1.5"),
				values: ["Hello world", "Goodbye world"],
			});

			expect(result.embeddings).toHaveLength(2);
			expect(result.embeddings[0].length).toBe(768);
			expect(result.embeddings[1].length).toBe(768);
			console.log(`  [embed] BGE Base EN OK — ${result.embeddings[0].length} dimensions`);
		});

		it("EmbeddingGemma 300M — should generate multilingual embeddings", async () => {
			const provider = makeProvider();

			const result = await embedMany({
				model: provider.textEmbedding("@cf/google/embeddinggemma-300m"),
				values: ["Hello world", "Bonjour le monde"],
			});

			expect(result.embeddings).toHaveLength(2);
			expect(result.embeddings[0].length).toBeGreaterThan(0);
			expect(result.embeddings[1].length).toBeGreaterThan(0);
			console.log(
				`  [embed] EmbeddingGemma 300M OK — ${result.embeddings[0].length} dimensions`,
			);
		});
	});

	// ------------------------------------------------------------------
	// Transcription (speech-to-text)
	// ------------------------------------------------------------------
	describe("transcription", () => {
		/**
		 * Generate a minimal valid WAV with a 440Hz tone.
		 */
		function createToneWav(durationMs = 500): Uint8Array {
			const sampleRate = 16000;
			const numSamples = Math.floor((sampleRate * durationMs) / 1000);
			const bytesPerSample = 2;
			const dataSize = numSamples * bytesPerSample;
			const buffer = new ArrayBuffer(44 + dataSize);
			const view = new DataView(buffer);

			const writeStr = (offset: number, str: string) => {
				for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
			};
			writeStr(0, "RIFF");
			view.setUint32(4, 36 + dataSize, true);
			writeStr(8, "WAVE");
			writeStr(12, "fmt ");
			view.setUint32(16, 16, true);
			view.setUint16(20, 1, true);
			view.setUint16(22, 1, true);
			view.setUint32(24, sampleRate, true);
			view.setUint32(28, sampleRate * bytesPerSample, true);
			view.setUint16(32, bytesPerSample, true);
			view.setUint16(34, 16, true);
			writeStr(36, "data");
			view.setUint32(40, dataSize, true);
			const freq = 440;
			const amplitude = 16000;
			for (let i = 0; i < numSamples; i++) {
				const sample = Math.round(
					amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate),
				);
				view.setInt16(44 + i * bytesPerSample, sample, true);
			}
			return new Uint8Array(buffer);
		}

		it("Whisper — should transcribe audio via REST", async () => {
			const provider = makeProvider();
			const wav = createToneWav(500);

			// A 440Hz tone won't produce meaningful text, but it should not error
			const result = await transcribe({
				model: provider.transcription("@cf/openai/whisper"),
				audio: wav,
				mediaType: "audio/wav",
			});

			expect(typeof result.text).toBe("string");
			console.log(`  [transcription] Whisper OK — "${result.text.slice(0, 50)}"`);
		});

		it("Whisper Tiny EN — should transcribe audio via REST", async () => {
			const provider = makeProvider();
			const wav = createToneWav(500);

			const result = await transcribe({
				model: provider.transcription("@cf/openai/whisper-tiny-en"),
				audio: wav,
			});

			expect(typeof result.text).toBe("string");
			console.log(`  [transcription] Whisper Tiny EN OK — "${result.text.slice(0, 50)}"`);
		});

		it("Whisper Large v3 Turbo — should transcribe via REST", async () => {
			const provider = makeProvider();
			const wav = createToneWav(500);

			const result = await transcribe({
				model: provider.transcription("@cf/openai/whisper-large-v3-turbo"),
				audio: wav,
				mediaType: "audio/wav",
			});

			expect(typeof result.text).toBe("string");
			console.log(`  [transcription] Whisper v3 Turbo OK — "${result.text.slice(0, 50)}"`);
		});

		it("Deepgram Nova-3 — should transcribe via REST (binary upload)", async () => {
			const provider = makeProvider();
			const wav = createToneWav(500);

			// Nova-3 returns empty text for non-speech audio (pure 440Hz tone),
			// which causes the AI SDK to throw NoTranscriptGeneratedError.
			// The important thing is the binary upload succeeded (no 400 error).
			try {
				const result = await transcribe({
					model: provider.transcription("@cf/deepgram/nova-3"),
					audio: wav,
					mediaType: "audio/wav",
				});
				// If we get here, Nova-3 found something to transcribe
				expect(typeof result.text).toBe("string");
				console.log(`  [transcription] Nova-3 REST OK — "${result.text.slice(0, 50)}"`);
			} catch (err: unknown) {
				// NoTranscriptGeneratedError means the binary upload worked,
				// but the model returned empty text for non-speech audio.
				expect((err as Error).message).toContain("No transcript generated");
				console.log(
					"  [transcription] Nova-3 REST OK — binary upload succeeded (empty transcript for non-speech audio)",
				);
			}
		});
	});

	// ------------------------------------------------------------------
	// Speech (text-to-speech)
	// ------------------------------------------------------------------
	describe("speech", () => {
		it("Deepgram Aura-1 — should generate speech via REST", async () => {
			const provider = makeProvider();

			const result = await generateSpeech({
				model: provider.speech("@cf/deepgram/aura-1"),
				text: "Hello, this is a test of text to speech.",
			});

			expect(result.audio).toBeDefined();
			expect(result.audio.uint8Array.length).toBeGreaterThan(100);
			console.log(`  [speech] Aura-1 OK — ${result.audio.uint8Array.length} bytes`);
		});

		it("Deepgram Aura-1 — should generate speech with voice option", async () => {
			const provider = makeProvider();

			const result = await generateSpeech({
				model: provider.speech("@cf/deepgram/aura-1"),
				text: "Testing voice selection.",
				voice: "asteria",
			});

			expect(result.audio).toBeDefined();
			expect(result.audio.uint8Array.length).toBeGreaterThan(100);
			console.log(
				`  [speech] Aura-1 with voice OK — ${result.audio.uint8Array.length} bytes`,
			);
		});

		it("Deepgram Aura-2 EN — should generate speech via REST", async () => {
			const provider = makeProvider();

			const result = await generateSpeech({
				model: provider.speech("@cf/deepgram/aura-2-en"),
				text: "Hello, this is a test of Aura two text to speech.",
			});

			expect(result.audio).toBeDefined();
			expect(result.audio.uint8Array.length).toBeGreaterThan(100);
			console.log(`  [speech] Aura-2 EN OK — ${result.audio.uint8Array.length} bytes`);
		});

		it("Deepgram Aura-2 EN — should generate speech with voice option", async () => {
			const provider = makeProvider();

			const result = await generateSpeech({
				model: provider.speech("@cf/deepgram/aura-2-en"),
				text: "Testing voice selection on Aura two.",
				voice: "asteria",
			});

			expect(result.audio).toBeDefined();
			expect(result.audio.uint8Array.length).toBeGreaterThan(100);
			console.log(
				`  [speech] Aura-2 EN with voice OK — ${result.audio.uint8Array.length} bytes`,
			);
		});
	});

	// ------------------------------------------------------------------
	// Reranking
	// ------------------------------------------------------------------
	describe("reranking", () => {
		it("BGE Reranker Base — should rerank documents via REST", async () => {
			const provider = makeProvider();

			const result = await rerank({
				model: provider.reranking("@cf/baai/bge-reranker-base"),
				query: "What is machine learning?",
				documents: [
					"Machine learning is a branch of artificial intelligence that focuses on building systems that learn from data.",
					"The weather forecast for tomorrow shows sunny skies.",
					"Deep learning is a subset of machine learning that uses neural networks with many layers.",
					"The recipe calls for two cups of flour and one cup of sugar.",
				],
			});

			expect(result.ranking.length).toBeGreaterThan(0);
			// The ML-related documents (index 0 and 2) should score higher
			console.log(
				`  [rerank] BGE Reranker Base OK — ${result.ranking.length} results, top: index ${result.ranking[0].originalIndex} (${result.ranking[0].score.toFixed(3)})`,
			);
		});
	});

	// ------------------------------------------------------------------
	// Error handling
	// ------------------------------------------------------------------
	describe("error handling", () => {
		it("should throw for an invalid model", async () => {
			const provider = makeProvider();
			await expect(
				generateText({
					model: provider("@cf/nonexistent/fake-model-999" as any),
					prompt: "Hi",
				}),
			).rejects.toThrow();
		});
	});
});
