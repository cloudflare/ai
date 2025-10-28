import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { allowedMethods } from "../middleware/allowedMethods.js";
import type { DescopeMcpProvider } from "../provider.js";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { AuthInteractionSession } from "../schemas/options.js";

export function authorizationHandler(provider: DescopeMcpProvider): Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }> {
	const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

	const sessionCookieName = "descope-auth-session";

	app.use("*", allowedMethods(["GET", "POST"]));

	app.all("/", async (c) => {
		const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
		if (!oauthReqInfo.clientId) {
			return c.text("Invalid request", 400);
		}

		const upstreamState = crypto.randomUUID();

		const authInteractionSession: AuthInteractionSession = {
			upstreamState,
			mcpAuthRequestInfo: oauthReqInfo,
		};

		setCookie(c, sessionCookieName, btoa(JSON.stringify(authInteractionSession)), {
			path: "/",
			httpOnly: true,
			secure: false, // TODO: Set to true in production
			sameSite: "lax",
			maxAge: 60 * 60 * 1, // 1 hour
		});

		const params = c.req.method === "POST" ? await c.req.parseBody() : c.req.query();

		if (!params.scope) {
			params.scope = "openid";
		}

		const targetUrl = provider.descopeOAuthEndpoints.authorization;
		targetUrl.search = new URLSearchParams({ ...params, state: upstreamState } as Record<string, string>).toString();

		return c.redirect(targetUrl.toString());
	});

	return app;
}
