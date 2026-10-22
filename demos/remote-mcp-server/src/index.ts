import OAuthProvider, { type OAuthProviderOptions } from "@cloudflare/workers-oauth-provider";
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

const oauthOptions = {
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
