import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { DescopeHandler } from "./descope-handler";
import type { Props } from "./descope-utils";

function requireProps(): Props {
	const props = getMcpAuthContext()?.props as Props | undefined;
	if (!props) {
		throw new Error("Missing authenticated Descope context");
	}
	return props;
}


function createServer() {
	const server = new McpServer({
		name: "Descope OAuth Proxy Demo",
		version: "1.0.0",
	});


	server.registerTool(
		"add",
		{
			description: "Add two numbers the way only MCP can",
			inputSchema: z.object({ a: z.number(), b: z.number() }),
		},
		async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}),
	);

	// Use the authenticated context to return user info
	server.registerTool(
		"getUserInfo",
		{
			description: "Get authenticated user info from Descope",
			inputSchema: z.object({}),
		},
		async () => {
			const props = requireProps();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							email: props.email,
							name: props.name,
							sub: props.sub,
						}),
					},
				],
			};
		},
	);

	// Return the access token
	server.registerTool(
		"getToken",
		{
			description: "Get the Descope access token",
			inputSchema: z.object({}),
		},
		async () => {
			const props = requireProps();
			return {
				content: [{ type: "text", text: `User's token: ${props.accessToken}` }],
			};
		},
	);

	return server;
}

const mcpHandler = createMcpHandler(createServer);

export default new OAuthProvider({
	// OAuthProvider verifies the bearer token and populates the request
	// context with the decrypted props before delegating to the MCP handler.
	apiHandler: {
		fetch: (request: Request, env: unknown, ctx: ExecutionContext) =>
			mcpHandler(request, env, ctx),
	},
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientIdMetadataDocumentEnabled: true,
	clientRegistrationEndpoint: "/register",
	defaultHandler: DescopeHandler as any,
	tokenEndpoint: "/token",
});
