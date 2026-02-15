/**
 * TanStack AI example worker — demonstrates chat, image generation,
 * transcription, text-to-speech, and summarization across multiple
 * AI providers (Workers AI, OpenAI, Anthropic, Gemini, Grok, OpenRouter).
 *
 * Routes: POST /ai/{provider}/{capability}
 *   - /ai/workers-ai-plain/chat    — Workers AI via env.AI binding
 *   - /ai/workers-ai/chat          — Workers AI via AI Gateway
 *   - /ai/openai/chat              — OpenAI via AI Gateway
 *   - /ai/anthropic/chat           — Anthropic via AI Gateway
 *   - /ai/gemini/chat              — Gemini via AI Gateway
 *   - /ai/grok/chat                — Grok via AI Gateway
 *   - /ai/openrouter/chat          — OpenRouter via AI Gateway
 *   Replace "chat" with: image, summarize, transcription, tts
 *
 * Discovery: GET /ai/providers — returns capabilities per provider
 *
 * For a minimal Workers AI-only example, see the examples/workers-ai directory.
 */
import {
	createAnthropicChat,
	createAnthropicSummarize,
	createGeminiChat,
	createGeminiImage,
	createGeminiSummarize,
	createGeminiTts,
	createGrokChat,
	createGrokImage,
	createGrokSummarize,
	createOpenAiChat,
	createOpenAiImage,
	createOpenAiSummarize,
	createOpenAiTranscription,
	createOpenAiTts,
	createOpenRouterChat,
	createOpenRouterImage,
	createOpenRouterSummarize,
	createWorkersAiChat,
	createWorkersAiImage,
	createWorkersAiSummarize,
	createWorkersAiTranscription,
	createWorkersAiTts,
	type WorkersAiTextModel,
} from "@cloudflare/tanstack-ai";
import type {
	AnyImageAdapter,
	AnySummarizeAdapter,
	AnyTextAdapter,
	AnyTranscriptionAdapter,
	AnyTTSAdapter,
} from "@tanstack/ai";
import {
	chat,
	generateImage,
	generateSpeech,
	generateTranscription,
	summarize,
	toHttpResponse,
	toolDefinition,
} from "@tanstack/ai";
import { env } from "cloudflare:workers";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Credential extraction from request headers
// ---------------------------------------------------------------------------

interface CloudflareCredentials {
	accountId: string;
	gatewayId: string;
	apiToken: string;
}

interface ProviderKeys {
	openai?: string;
	anthropic?: string;
	gemini?: string;
	grok?: string;
	openrouter?: string;
}

interface RequestCredentials {
	/** When true, use env.AI / env.AI.gateway() bindings directly */
	useBinding: boolean;
	cloudflare: CloudflareCredentials | null;
	/** Gateway ID (available in both modes, used for env.AI.gateway(id) in binding mode) */
	gatewayId?: string;
	providerKeys: ProviderKeys;
	/** Optional Workers AI model override from the frontend model selector */
	workersAiModel?: string;
}

function extractCredentials(request: Request): RequestCredentials {
	const useBinding = request.headers.get("X-Use-Binding") === "true";
	const accountId = request.headers.get("X-CF-Account-Id");
	const gatewayId = request.headers.get("X-CF-Gateway-Id");
	const apiToken = request.headers.get("X-CF-Api-Token");

	return {
		useBinding,
		cloudflare:
			!useBinding && accountId && gatewayId && apiToken
				? { accountId, gatewayId, apiToken }
				: null,
		gatewayId: gatewayId || undefined,
		providerKeys: {
			openai: request.headers.get("X-OpenAI-Api-Key") || undefined,
			anthropic: request.headers.get("X-Anthropic-Api-Key") || undefined,
			gemini: request.headers.get("X-Gemini-Api-Key") || undefined,
			grok: request.headers.get("X-Grok-Api-Key") || undefined,
			openrouter: request.headers.get("X-OpenRouter-Api-Key") || undefined,
		},
		workersAiModel: request.headers.get("X-Workers-AI-Model") || undefined,
	};
}

// ---------------------------------------------------------------------------
// Config builders
// ---------------------------------------------------------------------------

function gwRestConfig(creds: RequestCredentials, providerApiKey?: string) {
	const base = creds.cloudflare
		? {
				gatewayId: creds.cloudflare.gatewayId,
				accountId: creds.cloudflare.accountId,
				cfApiKey: creds.cloudflare.apiToken,
			}
		: {
				gatewayId: env.CLOUDFLARE_AI_GATEWAY_ID,
				accountId: env.CLOUDFLARE_ACCOUNT_ID,
				cfApiKey: env.CLOUDFLARE_API_TOKEN,
			};
	return providerApiKey ? { ...base, apiKey: providerApiKey } : base;
}

function resolveGatewayId(creds: RequestCredentials): string {
	return creds.gatewayId || env.CLOUDFLARE_AI_GATEWAY_ID || "default";
}

function gwBindingConfig(creds: RequestCredentials, providerApiKey?: string) {
	const base = { binding: env.AI.gateway(resolveGatewayId(creds)) };
	return providerApiKey ? { ...base, apiKey: providerApiKey } : base;
}

/** Workers AI direct config (binding or REST, no gateway) */
function workersAiConfig(creds: RequestCredentials) {
	if (creds.useBinding) return { binding: env.AI };
	if (creds.cloudflare)
		return { accountId: creds.cloudflare.accountId, apiKey: creds.cloudflare.apiToken };
	return { binding: env.AI };
}

/** Workers AI via gateway config */
function workersAiGatewayConfig(creds: RequestCredentials) {
	if (creds.useBinding) {
		return {
			binding: env.AI.gateway(resolveGatewayId(creds)),
		};
	}
	if (creds.cloudflare) {
		return gwRestConfig(creds);
	}
	return { binding: env.AI.gateway(resolveGatewayId(creds)) };
}

// ---------------------------------------------------------------------------
// Adapter factories
// ---------------------------------------------------------------------------

const DEFAULT_WORKERS_AI_MODELS: Record<string, string> = {
	"/ai/workers-ai-plain/chat": "@cf/moonshotai/kimi-k2.5",
	"/ai/workers-ai/chat": "@cf/qwen/qwen3-30b-a3b-fp8",
};

function getChatAdapter(provider: string, creds: RequestCredentials): AnyTextAdapter | null {
	const pk = creds.providerKeys;
	const waiModel = (creds.workersAiModel ||
		DEFAULT_WORKERS_AI_MODELS[`/ai/${provider}/chat`] ||
		"@cf/moonshotai/kimi-k2.5") as WorkersAiTextModel;

	switch (provider) {
		case "workers-ai-plain":
			return createWorkersAiChat(waiModel, workersAiConfig(creds));
		case "workers-ai":
			return createWorkersAiChat(waiModel, workersAiGatewayConfig(creds));
		case "openai":
			return createOpenAiChat(
				"gpt-5.2",
				creds.useBinding
					? gwBindingConfig(creds, pk.openai)
					: gwRestConfig(creds, pk.openai),
			);
		case "anthropic":
			return createAnthropicChat(
				"claude-opus-4-6",
				creds.useBinding
					? gwBindingConfig(creds, pk.anthropic)
					: gwRestConfig(creds, pk.anthropic),
			);
		case "gemini":
			return createGeminiChat("gemini-3-flash-preview", gwRestConfig(creds, pk.gemini));
		case "grok":
			return createGrokChat(
				"grok-4-1-fast-reasoning",
				creds.useBinding ? gwBindingConfig(creds, pk.grok) : gwRestConfig(creds, pk.grok),
			);
		case "openrouter":
			return createOpenRouterChat(
				"openai/gpt-4o",
				creds.useBinding
					? gwBindingConfig(creds, pk.openrouter)
					: gwRestConfig(creds, pk.openrouter),
			);
		default:
			return null;
	}
}

function getImageAdapter(provider: string, creds: RequestCredentials): AnyImageAdapter | null {
	const pk = creds.providerKeys;

	switch (provider) {
		case "workers-ai-plain":
			return createWorkersAiImage(
				"@cf/stabilityai/stable-diffusion-xl-base-1.0",
				workersAiConfig(creds),
			);
		case "workers-ai":
			return createWorkersAiImage(
				"@cf/stabilityai/stable-diffusion-xl-base-1.0",
				workersAiGatewayConfig(creds),
			);
		case "openai":
			return createOpenAiImage(
				"gpt-image-1",
				creds.useBinding
					? gwBindingConfig(creds, pk.openai)
					: gwRestConfig(creds, pk.openai),
			);
		case "gemini":
			return createGeminiImage("gemini-3-pro-image-preview", gwRestConfig(creds, pk.gemini));
		case "grok":
			return createGrokImage(
				"grok-2-image-1212",
				creds.useBinding ? gwBindingConfig(creds, pk.grok) : gwRestConfig(creds, pk.grok),
			);
		case "openrouter":
			return createOpenRouterImage(
				"openai/dall-e-3",
				creds.useBinding
					? gwBindingConfig(creds, pk.openrouter)
					: gwRestConfig(creds, pk.openrouter),
			);
		default:
			return null;
	}
}

function getSummarizeAdapter(
	provider: string,
	creds: RequestCredentials,
): AnySummarizeAdapter | null {
	const pk = creds.providerKeys;

	switch (provider) {
		case "workers-ai-plain":
			return createWorkersAiSummarize("@cf/facebook/bart-large-cnn", workersAiConfig(creds));
		case "workers-ai":
			return createWorkersAiSummarize(
				"@cf/facebook/bart-large-cnn",
				workersAiGatewayConfig(creds),
			);
		case "openai":
			return createOpenAiSummarize(
				"gpt-5.2",
				creds.useBinding
					? gwBindingConfig(creds, pk.openai)
					: gwRestConfig(creds, pk.openai),
			);
		case "anthropic":
			return createAnthropicSummarize(
				"claude-opus-4-6",
				creds.useBinding
					? gwBindingConfig(creds, pk.anthropic)
					: gwRestConfig(creds, pk.anthropic),
			);
		case "gemini":
			return createGeminiSummarize("gemini-2.0-flash", gwRestConfig(creds, pk.gemini));
		case "grok":
			return createGrokSummarize(
				"grok-4-1-fast-reasoning",
				creds.useBinding ? gwBindingConfig(creds, pk.grok) : gwRestConfig(creds, pk.grok),
			);
		case "openrouter":
			return createOpenRouterSummarize(
				"openai/gpt-4o",
				creds.useBinding
					? gwBindingConfig(creds, pk.openrouter)
					: gwRestConfig(creds, pk.openrouter),
			);
		default:
			return null;
	}
}

function getTranscriptionAdapter(
	provider: string,
	creds: RequestCredentials,
): AnyTranscriptionAdapter | null {
	const pk = creds.providerKeys;

	switch (provider) {
		case "workers-ai-plain":
			return createWorkersAiTranscription(
				"@cf/openai/whisper-large-v3-turbo",
				workersAiConfig(creds),
			);
		case "workers-ai":
			return createWorkersAiTranscription(
				"@cf/openai/whisper-large-v3-turbo",
				workersAiGatewayConfig(creds),
			);
		case "openai":
			return createOpenAiTranscription(
				"whisper-1",
				creds.useBinding
					? gwBindingConfig(creds, pk.openai)
					: gwRestConfig(creds, pk.openai),
			);
		default:
			return null;
	}
}

function getTTSAdapter(provider: string, creds: RequestCredentials): AnyTTSAdapter | null {
	const pk = creds.providerKeys;

	switch (provider) {
		case "workers-ai-plain":
			return createWorkersAiTts("@cf/deepgram/aura-2-en", workersAiConfig(creds));
		case "workers-ai":
			return createWorkersAiTts("@cf/deepgram/aura-2-en", workersAiGatewayConfig(creds));
		case "openai":
			return createOpenAiTts(
				"tts-1",
				creds.useBinding
					? gwBindingConfig(creds, pk.openai)
					: gwRestConfig(creds, pk.openai),
			);
		case "gemini":
			return createGeminiTts("gemini-2.5-flash-preview-tts", gwRestConfig(creds, pk.gemini));
		default:
			return null;
	}
}

// ---------------------------------------------------------------------------
// Provider capabilities (for the /ai/models discovery endpoint)
// ---------------------------------------------------------------------------

const PROVIDER_CAPABILITIES: Record<string, string[]> = {
	"workers-ai-plain": ["chat", "image", "transcription", "tts", "summarize"],
	"workers-ai": ["chat", "image", "transcription", "tts", "summarize"],
	openai: ["chat", "image", "transcription", "tts", "summarize"],
	anthropic: ["chat", "summarize"],
	gemini: ["chat", "image", "tts", "summarize"],
	grok: ["chat", "image", "summarize"],
	openrouter: ["chat", "image", "summarize"],
};

// ---------------------------------------------------------------------------
// Tools (for chat)
// ---------------------------------------------------------------------------

const tools = [
	toolDefinition({
		name: "sum",
		description: "Sum of two numbers",
		inputSchema: z.object({ a: z.number(), b: z.number() }),
	}).server((args) => ({ result: args.a + args.b })),
	toolDefinition({
		name: "multiply",
		description: "Multiply two numbers",
		inputSchema: z.object({ a: z.number(), b: z.number() }),
	}).server((args) => ({ result: args.a * args.b })),
	toolDefinition({
		name: "get_current_time",
		description: "Get the current UTC time",
		inputSchema: z.object({}),
	}).server(() => ({ time: new Date().toISOString() })),
	toolDefinition({
		name: "random_number",
		description: "Generate a random number between min and max",
		inputSchema: z.object({ min: z.number(), max: z.number() }),
	}).server((args) => ({
		result: Math.floor(Math.random() * (args.max - args.min + 1)) + args.min,
	})),
	toolDefinition({
		name: "reverse_string",
		description: "Reverse a string",
		inputSchema: z.object({ text: z.string() }),
	}).server((args) => ({
		reversed: args.text.split("").reverse().join(""),
	})),
	toolDefinition({
		name: "web_scrape",
		description:
			"Fetch and extract text content from a webpage URL. Only works with public HTTP/HTTPS URLs.",
		inputSchema: z.object({ url: z.string().describe("The URL to scrape") }),
	}).server(async (args) => {
		try {
			const parsed = new URL(args.url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return { url: args.url, error: "Only http and https URLs are allowed" };
			}
			const hostname = parsed.hostname.toLowerCase();
			if (
				hostname === "localhost" ||
				hostname.startsWith("127.") ||
				hostname.startsWith("10.") ||
				hostname.startsWith("192.168.") ||
				hostname === "169.254.169.254" ||
				hostname.startsWith("172.") ||
				hostname === "[::1]" ||
				hostname === "0.0.0.0"
			) {
				return { url: args.url, error: "Private/internal URLs are not allowed" };
			}
			const response = await fetch(args.url);
			const html = await response.text();
			const text = html
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, 5000);
			return { url: args.url, content: text };
		} catch (error) {
			return { url: args.url, error: String(error) };
		}
	}),
];

// ---------------------------------------------------------------------------
// Route pattern: /ai/{provider}/{capability}
// ---------------------------------------------------------------------------

function parseRoute(pathname: string): { provider: string; capability: string } | null {
	// Match /ai/{provider}/{capability}
	const match = pathname.match(/^\/ai\/([^/]+)\/(.+)$/);
	if (match) return { provider: match[1]!, capability: match[2]! };
	return null;
}

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

export default {
	async fetch(request) {
		const url = new URL(request.url);

		// Discovery endpoint
		if (url.pathname === "/ai/providers") {
			return Response.json(PROVIDER_CAPABILITIES);
		}

		if (request.method !== "POST") {
			if (url.pathname.startsWith("/ai/")) {
				return new Response("Method not allowed", { status: 405 });
			}
			return new Response(null, { status: 404 });
		}

		const route = parseRoute(url.pathname);
		if (!route) return new Response(null, { status: 404 });

		const creds = extractCredentials(request);
		const { provider, capability } = route;

		try {
			switch (capability) {
				// --- Chat ---
				case "chat": {
					const adapter = getChatAdapter(provider, creds);
					if (!adapter)
						return Response.json(
							{ error: `Chat not supported for ${provider}` },
							{ status: 404 },
						);

					const body = (await request.json()) as {
						messages: unknown[];
						data: { conversationId?: string };
					};
					const response = chat({
						adapter,
						stream: true,
						conversationId: body.data?.conversationId ?? crypto.randomUUID(),
						// eslint-disable-next-line @typescript-eslint/no-explicit-any -- messages from request body match at runtime
						messages: body.messages as any,
						temperature: 0.6,
						tools,
					});
					return toHttpResponse(response);
				}

				// --- Image ---
				case "image": {
					const adapter = getImageAdapter(provider, creds);
					if (!adapter)
						return Response.json(
							{ error: `Image not supported for ${provider}` },
							{ status: 404 },
						);

					const { prompt } = (await request.json()) as { prompt: string };
					if (!prompt?.trim())
						return Response.json({ error: "prompt is required" }, { status: 400 });

					const result = await generateImage({ adapter, prompt });
					return Response.json(result);
				}

				// --- Summarize ---
				case "summarize": {
					const adapter = getSummarizeAdapter(provider, creds);
					if (!adapter)
						return Response.json(
							{ error: `Summarize not supported for ${provider}` },
							{ status: 404 },
						);

					const { text } = (await request.json()) as { text: string };
					if (!text?.trim())
						return Response.json({ error: "text is required" }, { status: 400 });

					const result = await summarize({ adapter, text });
					return Response.json(result);
				}

				// --- Transcription ---
				case "transcription": {
					const adapter = getTranscriptionAdapter(provider, creds);
					if (!adapter)
						return Response.json(
							{ error: `Transcription not supported for ${provider}` },
							{ status: 404 },
						);

					const { audio } = (await request.json()) as { audio: string };
					if (!audio)
						return Response.json(
							{ error: "audio (base64) is required" },
							{ status: 400 },
						);

					const result = await generateTranscription({ adapter, audio });
					return Response.json(result);
				}

				// --- TTS ---
				case "tts": {
					const adapter = getTTSAdapter(provider, creds);
					if (!adapter)
						return Response.json(
							{ error: `TTS not supported for ${provider}` },
							{ status: 404 },
						);

					const { text } = (await request.json()) as { text: string };
					if (!text?.trim())
						return Response.json({ error: "text is required" }, { status: 400 });

					const result = await generateSpeech({ adapter, text });
					return Response.json(result);
				}

				default:
					return Response.json(
						{ error: `Unknown capability: ${capability}` },
						{ status: 404 },
					);
			}
		} catch (error) {
			return Response.json(
				{ error: error instanceof Error ? error.message : String(error) },
				{ status: 500 },
			);
		}
	},
} satisfies ExportedHandler<Env>;
