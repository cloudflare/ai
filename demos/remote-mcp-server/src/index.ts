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
		"add",
		{ inputSchema: z.object({ a: z.number(), b: z.number() }) },
		async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}),
	);

	return server;
}

const mcpHandler = createMcpHandler(createServer);

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/mcp",
	apiHandler: {
		fetch(request: Request, env: Env, ctx: ExecutionContext) {
			return mcpHandler(request, env, ctx);
		},
	},
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
