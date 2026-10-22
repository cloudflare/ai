import { env } from "cloudflare:workers";
import OAuthProvider, { type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import app from "./app";

function createServer() {
	const server = new McpServer({
		name: "Demo",
		version: "1.0.0",
	});

	server.registerTool(
		"Query AutoRAG <insert tool description here>",
		{ inputSchema: z.object({ query: z.string() }) },
		async ({ query }) => {
			const answer = await env.AI.autorag("add-name-of-your-autorag-here").aiSearch({
				query,
				model: "@cf/meta/llama-3.3-70b-instruct-sd",
				rewrite_query: true,
				max_num_results: 2,
				ranking_options: {
					score_threshold: 0.7,
				},
				stream: false,
			} as AutoRagSearchRequest);

			return {
				content: [{ type: "text", text: answer.response }],
			};
		},
	);

	return server;
}

const mcpHandler = createMcpHandler(createServer);

const oauthOptions = {
	apiRoute: "/mcp",
	apiHandler: {
		fetch(request: Request, bindings: Env, ctx: ExecutionContext) {
			return mcpHandler(request, bindings, ctx);
		},
	},
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
} satisfies Omit<OAuthProviderOptions<Env>, "resourceMetadata">;

// Workers OAuth Provider binds every token to the URL clients connect to, so
// build one provider per origin: workers.dev, a custom domain, or localhost.
const providers = new Map<string, OAuthProvider<Env>>();

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const { origin } = new URL(request.url);
		let provider = providers.get(origin);
		if (!provider) {
			provider = new OAuthProvider<Env>({
				...oauthOptions,
				resourceMetadata: { resource: `${origin}/mcp` },
			});
			providers.set(origin, provider);
		}
		return provider.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
