import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { LogtoHandler } from "./logto-handler";

// Context from the auth process, encrypted and stored in the auth token.
type Props = {
	userId: string;
	email: string;
	username: string;
};

function createServer() {
	const server = new McpServer({
		name: "Logto OAuth Proxy Demo",
		version: "1.0.0",
	});
	const props = getMcpAuthContext()?.props as Props | undefined;

	// Hello, world!
	server.registerTool(
		"add",
		{
			description: "Add two numbers the way only MCP can",
			inputSchema: z.object({ a: z.number(), b: z.number() }),
		},
		async ({ a, b }) => ({
			content: [{ text: String(a + b), type: "text" }],
		}),
	);

	// Use the props to provide user information
	server.registerTool(
		"getCurrentUserInfo",
		{ description: "Get current user info from Logto" },
		async () => ({
			content: [{ text: JSON.stringify(props), type: "text" }],
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
	defaultHandler: LogtoHandler as any,
	tokenEndpoint: "/token",
});
