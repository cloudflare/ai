import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { AtlassianHandler } from "./atlassian-handler";
import type { Props } from "./utils";

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Atlassian Confluence MCP Server",
		version: "1.0.0",
	});

	async init() {
		// Hello, world!
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: "text" }],
			}),
		);

		// Get current user information from Atlassian
		this.server.tool(
			"getUserInfo",
			"Get current user information from Atlassian",
			{},
			async () => {
				try {
					const response = await fetch(`https://api.atlassian.com/ex/confluence/${this.props.cloudId}/rest/api/user/current`, {
						headers: {
							"Authorization": `Bearer ${this.props.accessToken}`,
							"Accept": "application/json",
						},
					});

					if (!response.ok) {
						const errorText = await response.text();
						throw new Error(`Atlassian API error: ${response.status} ${response.statusText} - ${errorText}`);
					}

					const userInfo = await response.json() as {
						accountId: string;
						email?: string;
						displayName: string;
						publicName: string;
						profilePicture?: {
							path: string;
							width: number;
							height: number;
							isDefault: boolean;
						};
						type: string;
						accountType: string;
						timeZone: string;
						isExternalCollaborator: boolean;
					};

					return {
						content: [
							{
								text: JSON.stringify(userInfo, null, 2),
								type: "text",
							},
						],
					};
				} catch (error: any) {
					return {
						content: [
							{
								text: `Error fetching user info: ${error.message}`,
								type: "text",
							},
						],
					};
				}
			},
		);
	}
}

export default new OAuthProvider({
	apiHandler: MyMCP.mount("/sse") as any,
	apiRoute: "/sse",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: AtlassianHandler as any,
	tokenEndpoint: "/token",
});
