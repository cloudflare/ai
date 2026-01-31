import {
	createAnthropicChat,
	createGeminiChat,
	createGeminiSummarize,
	createGrokChat,
	createOpenAiChat,
	createOpenAiImage,
} from "@cloudflare/tanstack-ai";
import { chat, generateImage, summarize, toHttpResponse } from "@tanstack/ai";
import { env } from "cloudflare:workers";

const AI_ROUTES = {
	"/ai/anthropic": () =>
		createAnthropicChat("claude-sonnet-4-5", {
			binding: env.AI.gateway(env.CF_AIG_ID),
			// gatewayId: env.CF_AIG_ID,
			// accountId: env.CF_ACCOUNT_ID,
			// cfApiKey: env.CF_AIG_TOKEN,
		}),
	"/ai/openai": () =>
		createOpenAiChat("gpt-4o", {
			// binding: env.AI.gateway(env.CF_AIG_ID),
			gatewayId: env.CF_AIG_ID,
			accountId: env.CF_ACCOUNT_ID,
			cfApiKey: env.CF_AIG_TOKEN,
		}),
	"/ai/gemini": () =>
		createGeminiChat("gemini-2.0-flash", {
			// only supports env vars, no binding
			gatewayId: env.CF_AIG_ID,
			accountId: env.CF_ACCOUNT_ID,
			cfApiKey: env.CF_AIG_TOKEN,
		}),
	"/ai/grok": () =>
		createGrokChat("grok-4", {
			// binding: env.AI.gateway(env.CF_AIG_ID),
			gatewayId: env.CF_AIG_ID,
			accountId: env.CF_ACCOUNT_ID,
			cfApiKey: env.CF_AIG_TOKEN,
		}),
} as const;

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname.startsWith("/ai-image/openai")) {
			console.log("ai-image");

			const result = await generateImage({
				adapter: createOpenAiImage("gpt-image-1", {
					// binding: env.AI.gateway(env.CF_AIG_ID),
					gatewayId: env.CF_AIG_ID,
					accountId: env.CF_ACCOUNT_ID,
					cfApiKey: env.CF_AIG_TOKEN,
				}),
				modelOptions: {
					quality: "high", // 'high' | 'medium' | 'low' | 'auto'
					background: "transparent", // 'transparent' | 'opaque' | 'auto'
					output_format: "png", // 'png' | 'jpeg' | 'webp'
					moderation: "low", // 'low' | 'auto'
				},
				prompt: "A futuristic cityscape at sunset with cloudflare logo as sun",
			});

			console.log(result);

			// just testing output
			return new Response(result.images[0].url, {
				headers: {
					"Content-Type": "image/png",
				},
			});
		}

		if (url.pathname.startsWith("/ai-summarize")) {
			console.log("ai-summarize");

			const result = await summarize({
				adapter: createGeminiSummarize("gemini-2.0-flash", {
					gatewayId: env.CF_AIG_ID,
					accountId: env.CF_ACCOUNT_ID,
					cfApiKey: env.CF_AIG_TOKEN,
				}),
				style: "paragraph",
				text: "This is a test document to summarize, password is root123",
			});

			console.log(result);

			return new Response(result.summary);
		}

		const isAiRoute = Object.keys(AI_ROUTES).find((path) =>
			url.pathname.startsWith(path),
		);

		if (isAiRoute) {
			const {
				messages,
				data: { conversationId = crypto.randomUUID() },
			} = (await request.json()) as {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				messages: any[];
				data: { conversationId?: string };
			};

			const adapter = AI_ROUTES[isAiRoute as keyof typeof AI_ROUTES]();

			const response = chat({
				adapter,
				stream: true,
				conversationId,
				messages,
			});

			return toHttpResponse(response);
		}

		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
