import type { ExportedHandler } from "@cloudflare/workers-types";
import app from "./routes";
import OAuthProvider from "../lib/workers-oauth-provider";
import { DurableMCP } from "./lib/MCPEntrypoint";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class MyMCP extends DurableMCP {
	server = new McpServer({
		name: "Demo",
		version: "1.0.0",
	});

	async init() {
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			}),
		);
	}
}

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/sse",
	// TODO: fix these types
	apiHandler: MyMCP.mount("/sse") as unknown as ExportedHandler,
	defaultHandler: app as unknown as ExportedHandler,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
