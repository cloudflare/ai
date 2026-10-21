import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { GoogleHandler } from "./google-handler";

// Context from the auth process, encrypted and stored in the auth token.
// Read it inside the server with `getMcpAuthContext()?.props`.
export type Props = {
	name: string;
	email: string;
	accessToken: string;
};

function createServer() {
	const server = new McpServer({
		name: "Google OAuth Proxy Demo",
		version: "0.0.1",
	});

	server.registerTool(
		"add",
		{ inputSchema: z.object({ a: z.number(), b: z.number() }) },
		async ({ a, b }) => ({
			content: [{ text: String(a + b), type: "text" }],
		}),
	);

	return server;
}

const mcpHandler = createMcpHandler(createServer);

export default new OAuthProvider({
	apiHandler: {
		fetch(request: Request, env: Env, ctx: ExecutionContext) {
			return mcpHandler(request, env, ctx);
		},
	},
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GoogleHandler as any,
	tokenEndpoint: "/token",
});
