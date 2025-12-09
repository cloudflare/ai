import { env } from "cloudflare:workers";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Octokit } from "octokit";
import { z } from "zod";
import { GitHubHandler } from "./github-handler";
import { isTokenExpiringSoon, refreshUpstreamToken, type Props } from "./utils";

const ALLOWED_USERNAMES = new Set<string>([
	// Add GitHub usernames of users who should have access to the image generation tool
	// For example: 'yourusername', 'coworkerusername'
	"mattzcarey",
]);

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Github OAuth Proxy Demo",
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

		// Use the upstream access token to facilitate tools
		this.server.tool(
			"userInfoOctokit",
			"Get user info from GitHub, via Octokit",
			{},
			async () => {
				const octokit = new Octokit({ auth: this.props!.accessToken });
				return {
					content: [
						{
							text: JSON.stringify(await octokit.rest.users.getAuthenticated()),
							type: "text",
						},
					],
				};
			},
		);

		// Dynamically add tools based on the user's login. In this case, I want to limit
		// access to my Image Generation tool to just me
		if (ALLOWED_USERNAMES.has(this.props!.login)) {
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

// Token refresh buffer: refresh upstream GitHub token if it expires within 5 minutes
const TOKEN_REFRESH_BUFFER_SECONDS = 300;

export default new OAuthProvider({
	// NOTE - during the summer 2025, the SSE protocol was deprecated and replaced by the Streamable-HTTP protocol
	// https://developers.cloudflare.com/agents/model-context-protocol/transport/#mcp-server-with-authentication
	apiHandlers: {
		"/sse": MyMCP.serveSSE("/sse"), // deprecated SSE protocol - use /mcp instead
		"/mcp": MyMCP.serve("/mcp"), // Streamable-HTTP protocol
	},
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as any,
	tokenEndpoint: "/token",

	// Intercept token exchanges to refresh upstream GitHub tokens when needed
	tokenExchangeCallback: async (options) => {
		const props = options.props as Props;
		const now = Math.floor(Date.now() / 1000);

		// Handle initial authorization code exchange
		if (options.grantType === "authorization_code") {
			// If GitHub returned expiration info, sync our token TTL with it
			if (props.expiresAt) {
				return {
					accessTokenTTL: props.expiresAt - now,
					refreshTokenTTL: props.refreshTokenExpiresAt
						? props.refreshTokenExpiresAt - now
						: undefined,
					newProps: props,
				};
			}
			// No expiration info - GitHub OAuth App doesn't have expiration enabled
			return { newProps: props };
		}

		// Handle refresh token exchange
		if (options.grantType === "refresh_token") {
			// No refresh token = GitHub OAuth App without expiration (graceful fallback)
			if (!props.refreshToken) {
				return;
			}

			// Token still valid = no need to refresh upstream
			if (!isTokenExpiringSoon(props.expiresAt, TOKEN_REFRESH_BUFFER_SECONDS)) {
				return { accessTokenProps: props };
			}

			// Refresh upstream GitHub token
			const refreshed = await refreshUpstreamToken(
				props.refreshToken,
				env.GITHUB_CLIENT_ID,
				env.GITHUB_CLIENT_SECRET,
			);

			return {
				accessTokenTTL: refreshed.expires_in,
				newProps: {
					...props,
					accessToken: refreshed.access_token,
					refreshToken: refreshed.refresh_token ?? props.refreshToken,
					expiresAt: refreshed.expires_in ? now + refreshed.expires_in : undefined,
					refreshTokenExpiresAt: refreshed.refresh_token_expires_in
						? now + refreshed.refresh_token_expires_in
						: props.refreshTokenExpiresAt,
				},
			};
		}
	},
});
