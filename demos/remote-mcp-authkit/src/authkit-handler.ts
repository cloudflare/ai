import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as jose from "jose";
import { generatePKCECodes, verifyPKCE } from "./pkce";
import { type AccessToken, type AuthenticationResponse, WorkOS } from "@workos-inc/node";
import type { AuthInteractionSession, Props } from "./props";

const app = new Hono<{
	Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers };
	Variables: { workOS: WorkOS };
}>();

const sessionCookieName = "authkit-auth-session";

app.use(async (c, next) => {
	c.set("workOS", new WorkOS(c.env.WORKOS_CLIENT_SECRET));
	await next();
});

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!oauthReqInfo.clientId) {
		return c.text("Invalid request", 400);
	}

	const { codeChallenge, codeVerifier } = await generatePKCECodes();
	const upstreamState = crypto.randomUUID();

	const authInteractionSession: AuthInteractionSession = {
		upstreamState,
		codeVerifier,
		codeChallenge,
		mcpAuthRequestInfo: oauthReqInfo,
	};

	setCookie(c, sessionCookieName, btoa(JSON.stringify(authInteractionSession)), {
		path: "/",
		httpOnly: true,
		secure: false, // TODO: Set to true in production
		sameSite: "lax",
		maxAge: 60 * 60 * 1, // 1 hour
	});

	return Response.redirect(
		c.get("workOS").userManagement.getAuthorizationUrl({
			provider: "authkit",
			clientId: c.env.WORKOS_CLIENT_ID,
			redirectUri: new URL("/callback", c.req.url).href,
			state: upstreamState,
			codeChallenge,
			codeChallengeMethod: "S256",
		}),
	);
});

app.get("/callback", async (c) => {
	const workOS = c.get("workOS");

	const interactionSessionCookie = getCookie(c, sessionCookieName);

	if (!interactionSessionCookie) {
		return c.text("Invalid request", 400);
	}

	const { codeVerifier, mcpAuthRequestInfo: oauthReqInfo, upstreamState } = JSON.parse(
		atob(interactionSessionCookie),
	) as AuthInteractionSession;

	if (!oauthReqInfo.clientId) {
		return c.text("Invalid request", 400);
	}

	if (c.req.query("state") !== upstreamState) {
		return c.text("Invalid state", 400);
	}

	const code = c.req.query("code");
	if (!code) {
		return c.text("Missing code", 400);
	}

	let response: AuthenticationResponse;
	try {
		response = await workOS.userManagement.authenticateWithCode({
			clientId: c.env.WORKOS_CLIENT_ID,
			code,
			codeVerifier,
		});
	} catch (error) {
		console.error("Authentication error:", error);
		return c.text("Invalid authorization code", 400);
	}

	const { accessToken, organizationId, refreshToken, user } = response;
	const { permissions = [] } = jose.decodeJwt<AccessToken>(accessToken);

	// Clear the session cookie
	deleteCookie(c, sessionCookieName, {
		path: "/",
	});

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: user.id,
		metadata: {},
		scope: permissions,

		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			organizationId,
			permissions,
			refreshToken,
			user,
		} satisfies Props,
	});

	return Response.redirect(redirectTo);
});

export const AuthkitHandler = app;
