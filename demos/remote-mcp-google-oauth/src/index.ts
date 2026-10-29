import { env } from "cloudflare:workers";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createAmatRelay } from "./amat-relay";
import { GoogleHandler } from "./google-handler";

export type { Props } from "./utils";

// Every request to /mcp (and below) must carry an access token this provider issued for
// MCP_RESOURCE; anything else gets a 401 challenge before the relay runs. The Google
// handler serves /authorize and /callback; the provider serves /token, /register and the
// OAuth metadata documents.
export default new OAuthProvider<Env>({
	apiHandler: createAmatRelay(),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GoogleHandler as any,
	tokenEndpoint: "/token",
	// The URL MCP clients connect to. Every token is bound to it.
	resourceMetadata: { resource: env.MCP_RESOURCE, resource_name: "Amat Odoo MCP" },
});
