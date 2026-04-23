import { jwtVerify, createRemoteJWKSet } from "jose";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

export interface AccessIdentity {
	[key: string]: unknown;
	email: string;
	sub: string;
}

const ALLOWED_EMAILS = new Set(["<INSERT EMAIL>"]);

export class MyMCP extends McpAgent<Env, Record<string, never>, AccessIdentity> {
	server = new McpServer({
		name: "Access Self-Hosted MCP Demo",
		version: "1.0.0",
	});

	async init() {
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ text: String(a + b), type: "text" }],
			}),
		);

		if (this.props && ALLOWED_EMAILS.has(this.props.email)) {
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
						.describe("Number of diffusion steps (4-8)."),
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

/**
 * Verify the Access JWT using your team's public keys.
 * See: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */
async function verifyAccessJwt(token: string, env: Env): Promise<AccessIdentity> {
	const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));

	const { payload } = await jwtVerify(token, JWKS, {
		issuer: env.TEAM_DOMAIN,
		audience: env.POLICY_AUD,
	});

	return {
		email: (payload.email as string) ?? "unknown",
		sub: payload.sub ?? "unknown",
	};
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const token = request.headers.get("Cf-Access-Jwt-Assertion");
		if (!token) {
			return new Response("Unauthorized: missing Cf-Access-Jwt-Assertion", {
				status: 401,
			});
		}

		try {
			await verifyAccessJwt(token, env);
		} catch {
			return new Response("Invalid token", { status: 403 });
		}

		return MyMCP.serve("/mcp").fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
