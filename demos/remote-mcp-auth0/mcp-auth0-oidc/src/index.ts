import { env } from "cloudflare:workers";
import OAuthProvider, { type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { Hono } from "hono";
import { authorize, callback, confirmConsent, tokenExchangeCallback } from "./auth";
import type { UserProps } from "./types";

function createServer() {
	const server = new McpServer({
		name: "Auth0 OIDC Proxy Demo",
		version: "1.0.0",
	});
	const props = getMcpAuthContext()?.props as UserProps;

	// Useful for debugging. This will show the current user's claims and the Auth0 tokens.
	server.registerTool("whoami", { description: "Get the current user's details" }, async () => ({
		content: [{ text: JSON.stringify(props.claims, null, 2), type: "text" }],
	}));

	// Call the Todos API on behalf of the current user.
	server.registerTool(
		"list-todos",
		{ description: "List the current user's todos" },
		async () => {
			try {
				const response = await fetch(`${env.API_BASE_URL}/api/todos`, {
					headers: {
						// The Auth0 Access Token is available in props.tokenSet and can be used to call the Upstream API (Todos API).
						Authorization: `Bearer ${props.tokenSet.accessToken}`,
					},
				});

				const data = await response.json();
				return {
					content: [
						{
							text: JSON.stringify(data),
							type: "text",
						},
					],
				};
			} catch (e) {
				return {
					content: [{ text: `The call to the Todos API failed: ${e}`, type: "text" }],
				};
			}
		},
	);

	// Get the current user's billing settings.
	// Note that read:billing is not being requested by the MCP server, meaning that this request will fail.
	// This is to show it's possible to implement scenarios where the MCP server can only call the APIs which the user has consented to.
	server.registerTool(
		"list-billing",
		{ description: "List the current user's billing settings" },
		async () => {
			const response = await fetch(`${env.API_BASE_URL}/api/billing`, {
				headers: {
					Authorization: `Bearer ${props.tokenSet.accessToken}`,
				},
			});

			return {
				content: [{ text: await response.text(), type: "text" }],
			};
		},
	);

	return server;
}

const mcpHandler = createMcpHandler(createServer);

// Initialize the Hono app with the routes for the OAuth Provider.
const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();
app.get("/authorize", authorize);
app.post("/authorize", confirmConsent);
app.get("/callback", callback);

export default new OAuthProvider({
	apiHandler: {
		fetch(request: Request, bindings: Env, ctx: ExecutionContext) {
			return mcpHandler(request, bindings, ctx);
		},
	},
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: app,
	tokenEndpoint: "/token",
	tokenExchangeCallback,
});
