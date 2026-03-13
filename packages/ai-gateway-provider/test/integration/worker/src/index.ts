import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { createAIGateway } from "../../../../src";

interface Env {
	AI: {
		gateway(name: string): {
			run(data: unknown): Promise<Response>;
		};
	};
	OPENAI_API_KEY: string;
	CLOUDFLARE_GATEWAY_NAME_UNAUTH: string;
	CLOUDFLARE_GATEWAY_NAME_AUTH: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const gatewayName =
			url.searchParams.get("gateway") || env.CLOUDFLARE_GATEWAY_NAME_UNAUTH || "test-gateway";
		const byok = url.searchParams.get("byok") === "true";

		try {
			if (url.pathname === "/health") {
				return Response.json({
					status: "ok",
					hasOpenAIKey: !!env.OPENAI_API_KEY,
					hasAIBinding: !!env.AI,
					unauthGateway: env.CLOUDFLARE_GATEWAY_NAME_UNAUTH,
					authGateway: env.CLOUDFLARE_GATEWAY_NAME_AUTH,
				});
			}

			const openai = byok
				? createOpenAI({ apiKey: "unused" })
				: createOpenAI({ apiKey: env.OPENAI_API_KEY });

			const gateway = createAIGateway({
				binding: env.AI.gateway(gatewayName),
				provider: openai,
				byok,
			});

			if (url.pathname === "/generate") {
				const result = await generateText({
					model: gateway("gpt-4o-mini"),
					prompt: "Respond with exactly the word 'hello' and nothing else.",
				});
				return Response.json({
					text: result.text,
					usage: result.usage,
					gateway: gatewayName,
					byok,
				});
			}

			if (url.pathname === "/stream") {
				const result = streamText({
					model: gateway("gpt-4o-mini"),
					prompt: "Respond with exactly the word 'hello' and nothing else.",
				});
				return result.toTextStreamResponse();
			}

			if (url.pathname === "/generate-with-options") {
				const gatewayWithOptions = createAIGateway({
					binding: env.AI.gateway(gatewayName),
					provider: openai,
					byok,
					options: {
						collectLog: true,
						metadata: { test: true, byok },
					},
				});

				const result = await generateText({
					model: gatewayWithOptions("gpt-4o-mini"),
					prompt: "Respond with exactly the word 'hello' and nothing else.",
				});
				return Response.json({
					text: result.text,
					usage: result.usage,
					gateway: gatewayName,
					byok,
				});
			}

			return Response.json({ error: "Not found" }, { status: 404 });
		} catch (e) {
			const error = {
				message: e instanceof Error ? e.message : "Unknown error",
				name: e instanceof Error ? e.name : undefined,
				stack: e instanceof Error ? e.stack : undefined,
				gateway: gatewayName,
				byok,
			};
			console.error("[integration worker]", error.message, error.stack);
			return Response.json(error, { status: 500 });
		}
	},
};
