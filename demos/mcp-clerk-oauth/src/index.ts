import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ClerkHandler } from "./clerk-handler";
import type { Props } from "./types";

export class MyMCP extends McpAgent<Env, unknown, Props> {
	server = new McpServer({
		name: "Clerk OAuth Proxy Demo",
		version: "1.0.0",
	});

	async init() {
		// Hello, world!
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			}),
		);

		// Gets the currently signed in user's info on your Clerk app.
		this.server.tool("get_user", "Get the users info", {}, async () => {
			const accessToken = this.props.accessToken;

			const user = await fetch(`${this.env.CLERK_APP_URL}/oauth/userinfo`, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			}).then((r) => r.json());

			return {
				content: [{ type: "text", text: JSON.stringify(user) }],
			};
		});
	}
}

export default new OAuthProvider({
	apiRoute: "/sse",
	// @ts-ignore
	// ref: https://github.com/cloudflare/workers-oauth-provider/issues/17
	apiHandler: MyMCP.mount("/sse"),
	// @ts-ignore
	// ref: https://github.com/cloudflare/workers-oauth-provider/issues/17
	defaultHandler: ClerkHandler,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
