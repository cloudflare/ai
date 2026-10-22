import { env } from "cloudflare:workers";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
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

// Export the OAuth handler as the default
export default new OAuthProvider({
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
});
