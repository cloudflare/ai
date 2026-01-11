import { env } from "cloudflare:workers";
import {
	createAnthropic,
	createGemini,
	createGrok,
	createOpenAi,
} from "@cloudflare/tanstack-ai-adapters";
import { chat, toHttpResponse } from "@tanstack/ai";

const AI_ROUTES = {
	"/ai/anthropic": () =>
		createAnthropic("claude-sonnet-4-5", {
			// binding: env.AI.gateway(env.CF_AIG_ID),
			gatewayId: env.CF_AIG_ID,
			accountId: env.CF_ACCOUNT_ID,
			cfApiKey: env.CF_AIG_TOKEN,
		}),
	"/ai/openai": () =>
		createOpenAi("gpt-4o", {
			// binding: env.AI.gateway(env.CF_AIG_ID),
			gatewayId: env.CF_AIG_ID,
			accountId: env.CF_ACCOUNT_ID,
			cfApiKey: env.CF_AIG_TOKEN,
		}),
	"/ai/gemini": () =>
		createGemini("gemini-2.0-flash", {
			// only supports env vars, no binding
			gatewayId: env.CF_AIG_ID,
			accountId: env.CF_ACCOUNT_ID,
			cfApiKey: env.CF_AIG_TOKEN,
		}),
	"/ai/grok": () =>
		createGrok("grok-4", {
			// binding: env.AI.gateway(env.CF_AIG_ID),
			gatewayId: env.CF_AIG_ID,
			accountId: env.CF_ACCOUNT_ID,
			cfApiKey: env.CF_AIG_TOKEN,
		}),
} as const;

export default {
	async fetch(request) {
		const url = new URL(request.url);

		const isAiRoute = Object.keys(AI_ROUTES).find((path) => url.pathname.startsWith(path));

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
