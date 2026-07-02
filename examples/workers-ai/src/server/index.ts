/**
 * Workers AI example worker — demonstrates all workers-ai-provider
 * capabilities with the Vercel AI SDK: chat (streaming + tool calling),
 * image generation, embeddings, transcription, text-to-speech, and reranking.
 *
 * Routes: POST /api/{capability}
 *   - /api/chat        — streaming chat with tool calling
 *   - /api/image       — image generation (Flux, Stable Diffusion)
 *   - /api/embed       — text embeddings with similarity matrix
 *   - /api/transcribe  — speech-to-text (Whisper, Deepgram Nova-3)
 *   - /api/speech      — text-to-speech (Deepgram Aura-2)
 *   - /api/rerank      — document reranking for RAG
 *   - /api/gateway     — AI Gateway delegate: route a vendor/model slug through
 *                        the gateway with resumable streaming (COMING SOON) +
 *                        server-side cross-vendor fallback
 *
 * Supports both binding mode (env.AI) and REST mode (account ID + API key)
 * via request headers — see createProvider() below.
 */
import {
	streamText,
	isStepCount,
	tool,
	embedMany,
	convertToModelMessages,
	generateImage,
	transcribe,
	generateSpeech,
	rerank,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { openai } from "workers-ai-provider/openai";
import { anthropic } from "workers-ai-provider/anthropic";
import { z } from "zod/v4";

interface Env {
	AI: Ai;
	/** AI Gateway name for the /api/gateway delegate route (optional). */
	GATEWAY_NAME?: string;
}

/**
 * Create a Workers AI provider based on request headers.
 * Supports both binding mode (env.AI) and REST mode (account ID + API key).
 */
function createProvider(request: Request, env: Env) {
	const useBinding = request.headers.get("X-Use-Binding") === "true";

	if (useBinding || !request.headers.get("X-CF-Account-Id")) {
		return createWorkersAI({ binding: env.AI });
	}

	return createWorkersAI({
		accountId: request.headers.get("X-CF-Account-Id")!,
		apiKey: request.headers.get("X-CF-Api-Key")!,
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method !== "POST") {
			return new Response("Not found", { status: 404 });
		}

		const workersai = createProvider(request, env);

		try {
			switch (url.pathname) {
				// ---- Streaming chat with tool calling ----
				case "/api/chat": {
					const body = (await request.json()) as {
						messages: Array<Record<string, unknown>>;
						model?: string;
					};

					const model = body.model || "@cf/zai-org/glm-5.2";
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const messages = await convertToModelMessages(body.messages as any);

					const result = streamText({
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						model: workersai(model as any),
						messages,
						stopWhen: isStepCount(10),
						tools: {
							getWeather: tool({
								description:
									"Get the current weather for a city. Use this when the user asks about weather.",
								inputSchema: z.object({
									city: z.string().describe("City name"),
								}),
								execute: async ({ city }) => {
									const conditions = [
										"Sunny",
										"Cloudy",
										"Rainy",
										"Snowy",
										"Windy",
									];
									const condition =
										conditions[
											Math.abs(
												city
													.split("")
													.reduce((a, c) => a + c.charCodeAt(0), 0),
											) % conditions.length
										];
									return {
										city,
										temperature: 15 + (city.length % 20),
										condition,
										humidity: 40 + (city.length % 50),
									};
								},
							}),
						},
					});

					return result.toUIMessageStreamResponse({ sendReasoning: true });
				}

				// ---- Image generation ----
				case "/api/image": {
					const body = (await request.json()) as {
						prompt: string;
						model?: string;
					};

					const model = body.model || "@cf/black-forest-labs/flux-2-dev";

					const result = await generateImage({
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						model: workersai.image(model as any),
						prompt: body.prompt,
						size: "1024x1024",
					});

					const imageBytes = result.images[0].uint8Array;
					const base64 = btoa(
						Array.from(imageBytes)
							.map((byte) => String.fromCharCode(byte))
							.join(""),
					);

					return Response.json({
						image: `data:image/png;base64,${base64}`,
					});
				}

				// ---- Embeddings ----
				case "/api/embed": {
					const body = (await request.json()) as {
						texts: string[];
						model?: string;
					};

					const model = body.model || "@cf/baai/bge-m3";

					const { embeddings } = await embedMany({
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						model: workersai.textEmbedding(model as any),
						values: body.texts,
					});

					const similarities: number[][] = [];
					for (let i = 0; i < embeddings.length; i++) {
						similarities[i] = [];
						for (let j = 0; j < embeddings.length; j++) {
							similarities[i][j] = cosineSimilarity(embeddings[i], embeddings[j]);
						}
					}

					return Response.json({
						embeddings: embeddings.map((e) => ({
							dimensions: e.length,
							preview: e.slice(0, 5),
						})),
						similarities,
					});
				}

				// ---- Transcription (speech-to-text) ----
				case "/api/transcribe": {
					const body = (await request.json()) as {
						audio: string; // base64
						model?: string;
					};

					const model = body.model || "@cf/openai/whisper-large-v3-turbo";

					const result = await transcribe({
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						model: workersai.transcription(model as any),
						audio: body.audio,
					});

					return Response.json({
						text: result.text,
						segments: result.segments,
						language: result.language,
						durationInSeconds: result.durationInSeconds,
					});
				}

				// ---- Speech (text-to-speech) ----
				case "/api/speech": {
					const body = (await request.json()) as {
						text: string;
						model?: string;
						voice?: string;
					};

					const model = body.model || "@cf/deepgram/aura-2-en";

					const result = await generateSpeech({
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						model: workersai.speech(model as any),
						text: body.text,
						voice: body.voice,
					});

					// Convert audio bytes to base64
					const audioBytes = result.audio.uint8Array;
					const audioBase64 = btoa(
						Array.from(audioBytes)
							.map((byte) => String.fromCharCode(byte))
							.join(""),
					);

					return Response.json({
						audio: audioBase64,
						contentType: "audio/mp3",
					});
				}

				// ---- Reranking ----
				case "/api/rerank": {
					const body = (await request.json()) as {
						query: string;
						documents: string[];
						model?: string;
						topN?: number;
					};

					const model = body.model || "@cf/baai/bge-reranker-base";

					const result = await rerank({
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						model: workersai.reranking(model as any),
						query: body.query,
						documents: body.documents,
						topN: body.topN,
					});

					return Response.json({
						ranking: result.ranking.map((r) => ({
							index: r.originalIndex,
							score: r.score,
							document: r.document,
						})),
					});
				}

				// ---- AI Gateway delegate: unified routing + resume + fallback ----
				case "/api/gateway": {
					// Route a `vendor/model` slug (e.g. "openai/gpt-5") through AI
					// Gateway. The delegate requires the env.AI binding; resume only
					// works on the binding (the run path emits cf-aig-run-id), so in
					// REST mode this route returns a helpful error.
					if (
						!request.headers.get("X-Use-Binding") &&
						request.headers.get("X-CF-Account-Id")
					) {
						return Response.json(
							{
								error:
									"The AI Gateway delegate needs the env.AI binding (REST mode is " +
									"not supported for this route). Resumable streaming requires the binding.",
							},
							{ status: 400 },
						);
					}

					const body = (await request.json()) as {
						messages: Array<Record<string, unknown>>;
						model?: string;
						/** Optional second slug for cross-vendor server-side fallback. */
						fallbackModel?: string;
					};

					const gatewayName =
						request.headers.get("X-Gateway") || env.GATEWAY_NAME || "default";

					// Configure the provider to route third-party catalog slugs through
					// the gateway. One set of plugins handles every OpenAI-compatible
					// vendor (openai, xai, groq, deepseek, …) plus anthropic; the
					// transport (run vs gateway path) is selected per call.
					const gatewayAi = createWorkersAI({
						binding: env.AI,
						gateway: { id: gatewayName },
						providers: [openai, anthropic],
					});

					const slug = body.model || "openai/gpt-5.5";
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const messages = await convertToModelMessages(body.messages as any);

					// onDispatch fires once per dispatch with the resolved transport +
					// gateway headers (incl. runId — persist this to re-attach a resumed
					// stream across invocations).
					const onDispatch = (info: { transport: string; runId: string | null }) => {
						console.log("[gateway dispatch]", info.transport, "run:", info.runId);
					};

					const model = body.fallbackModel
						? // eslint-disable-next-line @typescript-eslint/no-explicit-any
							gatewayAi(slug as any, {
								// Cross-vendor server-side fallback: both legs ship in one
								// gateway run; cf-aig-step names the winner. (Uses the gateway
								// path, so resume is disabled for this call.)
								fallback: { mode: "server", models: [body.fallbackModel] },
								onDispatch,
							})
						: // eslint-disable-next-line @typescript-eslint/no-explicit-any
							gatewayAi(slug as any, {
								// Default: resumable run path. A mid-stream drop reconnects
								// transparently via cf-aig-run-id.
								resume: true,
								onResumeExpired: "accept-partial",
								onDispatch,
							});

					const result = streamText({ model, messages, stopWhen: isStepCount(5) });
					return result.toUIMessageStreamResponse({ sendReasoning: true });
				}

				default:
					return new Response("Not found", { status: 404 });
			}
		} catch (err) {
			console.error("[api error]", err);
			return Response.json(
				{
					error: err instanceof Error ? err.message : "Internal server error",
				},
				{ status: 500 },
			);
		}
	},
} satisfies ExportedHandler<Env>;

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
