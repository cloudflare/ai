import {
	createAnthropicChat,
	createGeminiChat,
	createGeminiSummarize,
	createGrokChat,
	createOpenAiChat,
	createOpenAiImage,
	createWorkersAiChat,
} from "@cloudflare/tanstack-ai";
import { chat, generateImage, summarize, toHttpResponse, toolDefinition } from "@tanstack/ai";
import { env } from "cloudflare:workers";
import { z } from "zod";

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
	"/ai/workers-ai": () =>
		createWorkersAiChat("@cf/qwen/qwen3-30b-a3b-fp8", {
			binding: env.AI.gateway(env.CF_AIG_ID),
			apiKey: env.WORKERS_AI_TOKEN,

			// gatewayId: env.CF_AIG_ID,
			// accountId: env.CF_ACCOUNT_ID,
			// cfApiKey: env.CF_AIG_TOKEN,
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

			console.log("isAiRoute", isAiRoute);

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
					description: "Fetch and extract text content from a webpage URL",
					inputSchema: z.object({ url: z.string().url() }),
				}).server(async (args) => {
					try {
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

			const response = chat({
				adapter,
				stream: true,
				conversationId,
				messages,
				temperature: 0.6,
				// outputSchema: PersonSchema,
				tools,
			});

			// return new Response(JSON.stringify(await response));
			return toHttpResponse(response);
		}

		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
