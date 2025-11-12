import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { ClerkHandler } from "./clerk-handler";
import type { Props } from "./utils";

// Roles that have access to the image generation tool
// Users can have their role set in Clerk's public_metadata field
const ALLOWED_ROLES = new Set<string>([
	"admin",
	"premium",
	"image_generation"
	// Add more roles as needed
]);

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Clerk OAuth Proxy Demo",
		version: "1.0.0",
	});

	async init() {
		// Hello, world!
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: "text" }],
			}),
		);

		// Get user info from Clerk JWT claims
		this.server.tool(
			"userInfo",
			"Get authenticated user information from Clerk",
			{},
			async () => {
				return {
					content: [
						{
							text: JSON.stringify({
								userId: this.props!.userId,
								sessionId: this.props!.sessionId,
								email: this.props!.email,
								firstName: this.props!.firstName,
								lastName: this.props!.lastName,
								imageUrl: this.props!.imageUrl,
								role: this.props!.role,
								metadata: this.props!.metadata,
							}, null, 2),
							type: "text",
						},
					],
				};
			},
		);

		console.log("User props:", this.props);
		// Dynamically add tools based on the user's role
		// Only users with specific roles can access the image generation tool
		if (this.props!.role && ALLOWED_ROLES.has(this.props!.role)) {
			this.server.tool(
				"generateImage",
				"Generate an image using the `flux-1-schnell` model. Works best with 8 steps.",
				{
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
				},
				async ({ prompt, steps }) => {
					const response = await this.env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
						prompt,
						steps,
					});

					return {
						content: [{ data: response.image!, mimeType: "image/jpeg", type: "image" }],
					};
				},
			);
		}
	}
}

const oauthProvider = new OAuthProvider({
	// NOTE - during the summer 2025, the SSE protocol was deprecated and replaced by the Streamable-HTTP protocol
	// https://developers.cloudflare.com/agents/model-context-protocol/transport/#mcp-server-with-authentication
	apiHandlers: {
		"/sse": MyMCP.serveSSE("/sse"), // deprecated SSE protocol - use /mcp instead
		"/mcp": MyMCP.serve("/mcp"), // Streamable-HTTP protocol
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: ClerkHandler as any,
	tokenEndpoint: "/token",
});

/**
 * Fetch handler to intercept OAuthProvider responses
 *
 * OAuthProvider serves some endpoints directly (not through defaultHandler):
 * - /.well-known/oauth-authorization-server (metadata)
 * - /mcp and /sse (MCP endpoints with OAuth checks)
 *
 * This wrapper fixes:
 * 1. OAuth metadata URLs to use HTTPS when behind proxies/tunnels
 * 2. Adds resource_metadata parameter to WWW-Authenticate headers on 401 responses
 */
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const response = await oauthProvider.fetch(request, env, ctx);

		const url = new URL(request.url);
		const isHTTPS = url.hostname !== "localhost" && !url.hostname.startsWith("127.");

		// Fix OAuth Authorization Server metadata to use HTTPS for tunnels
		if (
			isHTTPS &&
			url.pathname === "/.well-known/oauth-authorization-server" &&
			response.status === 200
		) {
			const metadata = await response.json<Record<string, any>>();

			// Replace all http:// URLs with https:// in the metadata
			const fixedMetadata = JSON.parse(
				JSON.stringify(metadata).replace(
					new RegExp(`http://${url.hostname}`, "g"),
					`https://${url.hostname}`
				)
			);

			return new Response(JSON.stringify(fixedMetadata), {
				status: response.status,
				statusText: response.statusText,
				headers: new Headers(response.headers),
			});
		}

		// Add WWW-Authenticate header with resource_metadata to 401 responses (RFC 9728)
		if (response.status === 401) {
			if (isHTTPS) {
				url.protocol = "https:";
			}

			url.pathname = "/.well-known/oauth-protected-resource";
			url.search = "";
			url.hash = "";
			const resourceMetadataUrl = url.href;

			const existingAuth = response.headers.get("WWW-Authenticate");
			const newHeaders = new Headers(response.headers);

			if (existingAuth) {
				// Append resource_metadata to existing header
				newHeaders.set(
					"WWW-Authenticate",
					`${existingAuth}, resource_metadata="${resourceMetadataUrl}"`
				);
			} else {
				// Create new WWW-Authenticate header
				newHeaders.set(
					"WWW-Authenticate",
					`Bearer resource_metadata="${resourceMetadataUrl}"`
				);
			}

			return new Response(response.body, {
				status: response.status,
				statusText: response.statusText,
				headers: newHeaders,
			});
		}

		return response;
	},
} satisfies ExportedHandler<Env>;
