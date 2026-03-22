/**
 * Test worker exercising workers-ai-provider through the env.AI binding.
 *
 * Each endpoint uses the provider internally and returns results as JSON.
 * This worker is started by wrangler dev during integration tests.
 */
import { createWorkersAI, createAISearch } from "../../../../../src/index";
import {
	generateText,
	streamText,
	stepCountIs,
	Output,
	embedMany,
	generateImage,
	experimental_transcribe as transcribe,
	experimental_generateSpeech as generateSpeech,
	rerank,
} from "ai";
import { z } from "zod/v4";

interface Env {
	AI: Ai;
	AI_SEARCH?: AutoRAG;
}

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return jsonResponse({ ok: true });
		}

		if (request.method !== "POST") {
			return jsonResponse({ error: "POST required" }, 405);
		}

		const body = (await request.json()) as { model?: string };
		const model = body.model || "@cf/meta/llama-4-scout-17b-16e-instruct";

		const provider = createWorkersAI({ binding: env.AI });

		try {
			switch (url.pathname) {
				// ----- Basic chat -----
				case "/chat": {
					const result = await generateText({
						model: provider(model as any),
						messages: [{ role: "user", content: "Say hello in one sentence." }],
					});
					return jsonResponse({
						text: result.text,
						finishReason: result.finishReason,
						usage: result.usage,
					});
				}

				// ----- Streaming chat -----
				case "/chat/stream": {
					const result = streamText({
						model: provider(model as any),
						messages: [{ role: "user", content: "Say hello in one sentence." }],
					});

					let text = "";
					for await (const chunk of result.textStream) {
						text += chunk;
					}

					return jsonResponse({
						text,
						finishReason: await result.finishReason,
					});
				}

				// ----- Multi-turn -----
				case "/chat/multi-turn": {
					const result = await generateText({
						model: provider(model as any),
						messages: [
							{ role: "user", content: "My name is Alice." },
							{ role: "assistant", content: "Hello Alice! Nice to meet you." },
							{ role: "user", content: "What is my name?" },
						],
					});
					return jsonResponse({ text: result.text });
				}

				// ----- Tool call (first round only) -----
				case "/chat/tool-call": {
					const result = await generateText({
						model: provider(model as any),
						messages: [
							{
								role: "user",
								content:
									"What is 2 + 3? You MUST use the calculator tool to answer.",
							},
						],
						tools: {
							calculator: {
								description:
									"Add two numbers. Returns their sum. Always use this tool for math.",
								inputSchema: z.object({
									a: z.number().describe("first number"),
									b: z.number().describe("second number"),
								}),
							},
						},
					});

					return jsonResponse({
						text: result.text,
						toolCalls: result.toolCalls,
						finishReason: result.finishReason,
					});
				}

				// ----- Tool round-trip (uses maxSteps for full loop) -----
				case "/chat/tool-roundtrip": {
					const result = await generateText({
						model: provider(model as any),
						messages: [
							{
								role: "user",
								content: "What time is it? Use the get_current_time tool.",
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

					return jsonResponse({
						text: result.text,
						steps: result.steps.length,
						toolCalls: result.toolCalls,
					});
				}

				// ----- Multi-step agentic tool loop -----
				case "/chat/tool-multistep": {
					const result = await generateText({
						model: provider(model as any),
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
								execute: async ({ a, b }: { a: number; b: number }) => ({
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
					return jsonResponse({
						text: result.text,
						steps: result.steps.length,
						toolCallCount,
					});
				}

				// ----- toolChoice: "required" -----
				case "/chat/tool-required": {
					const result = await generateText({
						model: provider(model as any),
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

					return jsonResponse({
						text: result.text,
						toolCalls: result.toolCalls,
						finishReason: result.finishReason,
					});
				}

				// ----- Structured output -----
				case "/chat/structured": {
					const result = await generateText({
						model: provider(model as any),
						prompt: "Give me info about France. Return JSON with name, capital, and population.",
						output: Output.object({
							schema: z.object({
								name: z.string(),
								capital: z.string(),
								population: z.number(),
							}),
						}),
					});

					return jsonResponse({ result: result.output });
				}

				// ----- Vision (image input) -----
				case "/chat/vision": {
					const vBody = body as { model?: string; imageBytes?: number[] };
					const visionModel = vBody.model || "@cf/meta/llama-3.2-11b-vision-instruct";
					const imageBytes = vBody.imageBytes;

					if (!imageBytes || imageBytes.length === 0) {
						return jsonResponse({ error: "imageBytes required" }, 400);
					}

					const result = await generateText({
						model: provider(visionModel as any),
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
										image: new Uint8Array(imageBytes),
									},
								],
							},
						],
					});

					return jsonResponse({
						text: result.text,
						finishReason: result.finishReason,
						usage: result.usage,
					});
				}

				// ----- Image generation -----
				case "/image": {
					const imageModel = body.model || "@cf/black-forest-labs/flux-1-schnell";
					const imageProvider = createWorkersAI({ binding: env.AI });
					const imageResult = await generateImage({
						model: imageProvider.image(imageModel as any),
						prompt: "A cute cartoon cat sitting on a grassy hill under a blue sky",
						size: "256x256",
					});

					return jsonResponse({
						imageCount: imageResult.images.length,
						imageSize: imageResult.images[0]?.uint8Array.length ?? 0,
					});
				}

				// ----- Embeddings -----
				case "/embed": {
					const embedModel = body.model || "@cf/baai/bge-base-en-v1.5";
					const embedProvider = createWorkersAI({ binding: env.AI });
					const embedResult = await embedMany({
						model: embedProvider.textEmbedding(embedModel as any),
						values: ["Hello world", "Goodbye world"],
					});

					return jsonResponse({
						count: embedResult.embeddings.length,
						dimensions: embedResult.embeddings[0]?.length ?? 0,
					});
				}

				// ----- AI Search: basic chat -----
				case "/aisearch/chat": {
					if (!env.AI_SEARCH) {
						return jsonResponse(
							{ error: "AI_SEARCH binding not configured", skipped: true },
							200,
						);
					}
					const aisearch = createAISearch({ binding: env.AI_SEARCH });
					const result = await generateText({
						model: aisearch(),
						messages: [
							{ role: "user", content: body.model || "What is Cloudflare Workers?" },
						],
					});
					return jsonResponse({
						text: result.text,
						finishReason: result.finishReason,
					});
				}

				// ----- AI Search: streaming -----
				case "/aisearch/stream": {
					if (!env.AI_SEARCH) {
						return jsonResponse(
							{ error: "AI_SEARCH binding not configured", skipped: true },
							200,
						);
					}
					const aisearchStream = createAISearch({ binding: env.AI_SEARCH });
					const streamResult = streamText({
						model: aisearchStream(),
						messages: [
							{ role: "user", content: body.model || "What is Cloudflare Workers?" },
						],
					});

					let streamText_ = "";
					for await (const chunk of streamResult.textStream) {
						streamText_ += chunk;
					}

					return jsonResponse({
						text: streamText_,
						finishReason: await streamResult.finishReason,
					});
				}

				// ----- Transcription -----
				case "/transcription": {
					const txBody = body as { model?: string; audio?: number[] };
					const txModel = txBody.model || "@cf/openai/whisper";
					const audioData = txBody.audio || Array.from(new Uint8Array(16000));

					try {
						const result = await transcribe({
							model: provider.transcription(txModel as any),
							audio: new Uint8Array(audioData),
							mediaType: "audio/wav",
						});
						return jsonResponse({
							text: result.text,
							segments: result.segments,
							language: result.language,
							durationInSeconds: result.durationInSeconds,
						});
					} catch (err: unknown) {
						return jsonResponse({ error: (err as Error).message }, 500);
					}
				}

				// ----- Speech (TTS) -----
				case "/speech": {
					const sBody = body as { model?: string; text?: string; voice?: string };
					const speechModel = sBody.model || "@cf/deepgram/aura-1";
					try {
						const result = await generateSpeech({
							model: provider.speech(speechModel as any),
							text: sBody.text || "Hello, this is a test.",
							voice: sBody.voice,
						});
						return jsonResponse({
							audioLength: result.audio.uint8Array.length,
						});
					} catch (err: unknown) {
						return jsonResponse({ error: (err as Error).message }, 500);
					}
				}

				// ----- Reranking -----
				case "/rerank": {
					const rkBody = body as {
						query?: string;
						documents?: string[];
					};
					try {
						const result = await rerank({
							model: provider.reranking("@cf/baai/bge-reranker-base"),
							query: rkBody.query || "test query",
							documents: rkBody.documents || ["doc1", "doc2"],
						});
						return jsonResponse({
							rankingCount: result.ranking.length,
							topIndex: result.ranking[0]?.originalIndex,
							topScore: result.ranking[0]?.score,
						});
					} catch (err: unknown) {
						return jsonResponse({ error: (err as Error).message }, 500);
					}
				}

				default:
					return jsonResponse({ error: `Unknown path: ${url.pathname}` }, 404);
			}
		} catch (err: unknown) {
			return jsonResponse(
				{
					error: (err as Error).message,
					stack: (err as Error).stack,
				},
				500,
			);
		}
	},
};
