import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { LogtoHandler } from "./logto-handler";
import { Props } from "./types";


// Define our MCP agent with tools
export class MyMCP extends McpAgent<Props, Env> {
	server = new McpServer({
		name: "Logto Proxy Demo",
		version: "1.0.0",
	});

	async init() {
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		this.server.tool(
			"getCurrentUserInfo",
			"Get user info from Logto",
			{},
			async () => {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(this.props),
						},
					],
				};
			},
		);
	}
}

export default new OAuthProvider({
	apiRoute: "/sse",
	// @ts-ignore
	apiHandler: MyMCP.mount("/sse"),
	// @ts-ignore
	defaultHandler: LogtoHandler,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
