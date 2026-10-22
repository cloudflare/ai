import { env } from "cloudflare:workers";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { AuthkitHandler } from "./authkit-handler";
import type { Props } from "./props";

function createServer() {
	const server = new McpServer({
		name: "MCP server demo using AuthKit",
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
			content: [{ type: "text", text: String(a + b) }],
		}),
	);

	// Dynamically add tools based on the user's permissions. They must have the
	// `image_generation` permission to use this tool.
	if (props?.permissions.includes("image_generation")) {
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
				const response = await (env as Env).AI.run("@cf/black-forest-labs/flux-1-schnell", {
					prompt,
					steps,
				});

				return {
					content: [
						{
							type: "image",
							data: response.image!,
							mimeType: "image/jpeg",
						},
					],
				};
			},
		);
	}

	return server;
}

const mcpHandler = createMcpHandler(createServer);

export default new OAuthProvider({
	apiRoute: "/mcp",
	apiHandler: {
		fetch(request: Request, bindings: Env, ctx: ExecutionContext) {
			return mcpHandler(request, bindings, ctx);
		},
	},
	defaultHandler: AuthkitHandler as any, // Use 'any' for maximum flexibility
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
