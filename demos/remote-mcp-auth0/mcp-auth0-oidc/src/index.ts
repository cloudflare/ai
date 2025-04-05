import { Hono } from "hono";
import { DurableMCP } from "workers-mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import OAuthProvider, { type OAuthHelpers } from "@cloudflare/workers-oauth-provider";

import type { UserProps } from "./types";
import { authorize, callback, confirmConsent, tokenExchangeCallback } from "./auth";

export class AuthenticatedMCP extends DurableMCP<UserProps, Env> {
	server = new McpServer({
		name: "Auth0 OIDC Proxy Demo",
		version: "1.0.0",
	});

	async init() {
		// Useful for debugging. This will show the current user's claims and the Auth0 tokens.
		this.server.tool("whoami", "Get the current user's details", {}, async () => ({
			content: [{ type: "text", text: JSON.stringify(this.props.claims, null, 2) }],
		}));

		// Call the Todos API on behalf of the current user.
		this.server.tool("list-todos", "List the current user's todos", {}, async () => {
			try {
				const response = await fetch(`${this.env.API_BASE_URL}/api/todos`, {
					headers: {
						// The Auth0 Access Token is available in props.tokenSet and can be used to call the Upstream API (Todos API).
						Authorization: `Bearer ${this.props.tokenSet.accessToken}`,
					},
				});

				const data = await response.json();
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(data),
						},
					],
				};
			} catch (e) {
				return {
					content: [{ type: "text", text: `The call to the Todos API failed: ${e}` }],
				};
			}
		});

		// Get the current user's billing settings.
		// Note that read:billing is not being requested by the MCP server, meaning that this request will fail.
		// This is to show it's possible to implement scenarios where the MCP server can only call the APIs which the user has consented to.
		this.server.tool(
			"list-billing",
			"List the current user's billing settings",
			{},
			async () => {
				const response = await fetch(`${this.env.API_BASE_URL}/api/billing`, {
					headers: {
						Authorization: `Bearer ${this.props.tokenSet.accessToken}`,
					},
				});

				return {
					content: [{ type: "text", text: await response.text() }],
				};
			},
		);
	}
}

// Initialize the Hono app with the routes for the OAuth Provider.
const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();
app.get("/authorize", authorize);
app.post("/authorize/consent", confirmConsent);
app.get("/callback", callback);

export default new OAuthProvider({
	apiRoute: "/sse",
	// TODO: fix these types
	// @ts-ignore
	apiHandler: AuthenticatedMCP.mount("/sse"),
	// TODO: fix these types
	// @ts-ignore
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
	tokenExchangeCallback,
});
