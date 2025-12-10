import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import app from "./app";

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Demo",
		version: "1.0.0",
	});

	async init() {
		this.server.tool(
			"Query AutoRAG <insert tool description here>",
			{ query: z.string() },
			async ({ query }) => {
				const answer = await this.env.AI.autorag("add-name-of-your-autorag-here").aiSearch({
					query,
					model: "@cf/meta/llama-3.3-70b-instruct-sd",
					rewrite_query: true,
					max_num_results: 2,
					ranking_options: {
						score_threshold: 0.7,
					},
					stream: false,
				});

				return {
					content: [{ type: "text", text: answer }],
				};
			},
		);
	}
}

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/sse",
	// TODO: fix these types
	// @ts-expect-error
	apiHandler: MyMCP.mount("/sse"),
	// @ts-expect-error
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
