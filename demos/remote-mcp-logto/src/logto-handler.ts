import { Hono } from "hono";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { renderApprovalDialog } from "./workers-oauth-utils";
import { env } from "cloudflare:workers";

import { LogtoConfig } from "@logto/node";
import { LogtoHonoClient } from "./logto";
import { AuthInteractionSession, Props } from "./types";
import { getCookie, setCookie } from "hono/cookie";

const logtoConfig: LogtoConfig = {
	endpoint: env.LOGTO_ENDPOINT,
	appId: env.LOGTO_APP_ID,
	appSecret: env.LOGTO_APP_SECRET,
};

const sessionCookieName = "auth-session";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
	const mcpAuthRequestInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(
		c.req.raw
	);
	const { clientId } = mcpAuthRequestInfo;

	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	const sessionId = crypto.randomUUID();

	const authInteractionSession: AuthInteractionSession = {
		sessionId,
		mcpAuthRequestInfo,
	};

	setCookie(
		c,
		sessionCookieName,
		btoa(JSON.stringify(authInteractionSession)),
		{
			path: "/",
			httpOnly: true,
			/**
			 * NOTE: Development environment only!
			 * For production:
			 * - Set secure: true to ensure cookies are only sent over HTTPS
			 * - Consider using sameSite: "strict" for better CSRF protection
			 */
			secure: false,
			sameSite: "lax",
			maxAge: 60 * 60 * 1, // 1 hour
		}
	);

	return c.html(
		renderApprovalDialog(c.req.raw, {
			client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
			server: {
				name: "Cloudflare Logto MCP Server",
				logo: "https://avatars.githubusercontent.com/u/84981374?s=200&v=4",
				description:
					"This is a demo MCP Remote Server using Logto for authentication.", // optional
			},
			csrfToken: sessionId,
		})
	);
});

app.post("/authorize", async (c) => {
	const formData = await c.req.formData();
	const csrfToken = formData.get("csrfToken") as string;

	if (!csrfToken) {
		return c.text("Invalid request", 400);
	}

	const interactionSessionCookie = getCookie(c, sessionCookieName);

	if (!interactionSessionCookie) {
		return c.text("Invalid request", 400);
	}

	const interactionSession = JSON.parse(
		atob(interactionSessionCookie)
	) as AuthInteractionSession;

	const { sessionId, mcpAuthRequestInfo } = interactionSession;

	if (sessionId !== csrfToken) {
		return c.text("Invalid request", 400);
	}

	if (!mcpAuthRequestInfo) {
		return c.text("Invalid request", 400);
	}

	// Redirect to Logto
	const logtoClient = new LogtoHonoClient(logtoConfig, sessionId);
	return logtoClient.handleSignIn(new URL("/callback", c.req.raw.url).href);
});

app.get("/callback", async (c) => {
	const interactionSessionCookie = getCookie(c, sessionCookieName);

	if (!interactionSessionCookie) {
		return c.text("Invalid request", 400);
	}

	const interactionSession = JSON.parse(
		atob(interactionSessionCookie)
	) as AuthInteractionSession;

	if (!interactionSession) {
		return c.text("Invalid request", 400);
	}

	const { sessionId, mcpAuthRequestInfo } = interactionSession;

	if (!mcpAuthRequestInfo?.clientId) {
		return c.text("Invalid request", 400);
	}

	const logtoClient = new LogtoHonoClient(logtoConfig, sessionId);
	await logtoClient.handleSignInCallback(c.req.raw.url);

	// Get the ID token claims after the sign in callback has been handled
	const { sub, email, username } = await logtoClient.getIdTokenClaims();

	// Clear the session cookie
	setCookie(c, sessionCookieName, "", {
		path: "/",
		maxAge: 0,
	});

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: mcpAuthRequestInfo,
		userId: sub,
		metadata: {
			label: username || email || sub,
		},
		scope: mcpAuthRequestInfo.scope,
		props: {
			userId: sub,
			email,
			username,
		} as Props,
	});

	return Response.redirect(redirectTo);
});

export { app as LogtoHandler };
