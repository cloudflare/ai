import OAuthProvider, { type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
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

const oauthOptions = {
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
} satisfies Omit<OAuthProviderOptions<Env>, "resourceMetadata">;

// Workers OAuth Provider binds every token to the URL clients connect to, so
// build one provider per origin: workers.dev, a custom domain, or localhost.
const providers = new Map<string, OAuthProvider<Env>>();

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const { origin } = new URL(request.url);
		let provider = providers.get(origin);
		if (!provider) {
			provider = new OAuthProvider<Env>({
				...oauthOptions,
				resourceMetadata: { resource: `${origin}/mcp` },
			});
			providers.set(origin, provider);
		}
		return provider.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
