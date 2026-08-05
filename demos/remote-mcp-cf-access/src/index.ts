import { env } from "cloudflare:workers";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { handleAccessRequest } from "./access-handler";
import type { Props } from "./workers-oauth-utils";

const ALLOWED_EMAILS = new Set(["<INSERT EMAIL>"]);

function createServer() {
	const server = new McpServer({
		name: "Access OAuth Proxy Demo",
		version: "1.0.0",
	});
	const props = getMcpAuthContext()?.props as Props | undefined;

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

	// Dynamically add tools based on the authenticated user's email.
	if (props && ALLOWED_EMAILS.has(props.email)) {
		server.registerTool(
			"generateImage",
			{
				description:
					"Generate an image using the `flux-1-schnell` model. Works best with 8 steps.",
				inputSchema: z.object({
					prompt: z
						.string()
						.describe("A text description of the image you want to generate."),
					steps: z
						.number()
						.min(4)
						.max(8)
						.default(4)
						.describe(
							"The number of diffusion steps; higher values can improve quality but take longer. Must be between 4 and 8, inclusive.",
						),
				}),
			},
			async ({ prompt, steps }) => {
				const response = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
					prompt,
					steps,
				});

				return {
					content: [{ data: response.image!, mimeType: "image/jpeg", type: "image" }],
				};
			},
		);
	}

	return server;
}

const mcpHandler = createMcpHandler(createServer);
const apiHandler = {
	fetch(request: Request, bindings: Env, ctx: ExecutionContext) {
		return mcpHandler(request, bindings, ctx);
	},
} satisfies ExportedHandler<Env>;

export default new OAuthProvider({
	allowPlainPKCE: false,
	apiHandler,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: { fetch: handleAccessRequest as any },
	tokenEndpoint: "/token",
});
