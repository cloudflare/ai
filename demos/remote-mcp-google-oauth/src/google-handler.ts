import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { generatePKCECodes, verifyPKCE } from "./pkce";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type AuthInteractionSession, type Props } from "./utils";
import { renderApprovalDialog } from "./workers-oauth-utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

const sessionCookieName = "google-auth-session";

app.get("/authorize", async (c) => {
	const mcpAuthRequestInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = mcpAuthRequestInfo;

	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	const { codeChallenge, codeVerifier } = await generatePKCECodes();
	const csrfToken = crypto.randomUUID();
	const upstreamState = crypto.randomUUID();

	const authInteractionSession: AuthInteractionSession = {
		csrfToken,
		upstreamState,
		codeVerifier,
		codeChallenge,
		mcpAuthRequestInfo,
	};

	setCookie(c, sessionCookieName, btoa(JSON.stringify(authInteractionSession)), {
		path: "/",
		httpOnly: true,
		secure: false, // TODO: Set to true in production
		sameSite: "lax",
		maxAge: 60 * 60 * 1, // 1 hour
	});

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		server: {
			description: "This MCP Server is a demo for Google OAuth.",
			name: "Google OAuth Demo",
		},
		csrfToken,
	});
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

	const interactionSession = JSON.parse(atob(interactionSessionCookie)) as AuthInteractionSession;

	const { csrfToken: expectedCsrfToken, mcpAuthRequestInfo } = interactionSession;

	if (expectedCsrfToken !== csrfToken) {
		return c.text("Invalid CSRF token", 400);
	}

	if (!mcpAuthRequestInfo) {
		return c.text("Invalid request", 400);
	}

	return redirectToGoogle(c, interactionSession);
});

async function redirectToGoogle(c: Context, interactionSession: AuthInteractionSession) {
	const { upstreamState, codeChallenge, mcpAuthRequestInfo } = interactionSession;
	return new Response(null, {
		headers: {
			location: getUpstreamAuthorizeUrl({
				clientId: c.env.GOOGLE_CLIENT_ID,
				hostedDomain: c.env.HOSTED_DOMAIN,
				redirectUri: new URL("/callback", c.req.raw.url).href,
				scope: "email profile",
				state: upstreamState,
				code_challenge: codeChallenge,
				code_challenge_method: "S256",
				upstreamUrl: "https://accounts.google.com/o/oauth2/v2/auth",
			}),
		},
		status: 302,
	});
}

app.get("/callback", async (c) => {
	const interactionSessionCookie = getCookie(c, sessionCookieName);

	if (!interactionSessionCookie) {
		return c.text("Invalid request", 400);
	}

	const interactionSession = JSON.parse(atob(interactionSessionCookie)) as AuthInteractionSession;

	if (!interactionSession) {
		return c.text("Invalid request", 400);
	}

	const { mcpAuthRequestInfo, upstreamState, codeVerifier } = interactionSession;

	if (c.req.query("state") !== upstreamState) {
		return c.text("Invalid state", 400);
	}

	if (!mcpAuthRequestInfo?.clientId) {
		return c.text("Invalid request", 400);
	}

	const code = c.req.query("code");
	if (!code) {
		return c.text("Missing code", 400);
	}

	const [accessToken, googleErrResponse] = await fetchUpstreamAuthToken({
		clientId: c.env.GOOGLE_CLIENT_ID,
		clientSecret: c.env.GOOGLE_CLIENT_SECRET,
		code,
		grantType: "authorization_code",
		redirectUri: new URL("/callback", c.req.url).href,
		upstreamUrl: "https://accounts.google.com/o/oauth2/token",
		code_verifier: codeVerifier,
	});
	if (googleErrResponse) {
		return googleErrResponse;
	}

	const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});
	if (!userResponse.ok) {
		return c.text(`Failed to fetch user info: ${await userResponse.text()}`, 500);
	}
	const { id, name, email } = (await userResponse.json()) as {
		id: string;
		name: string;
		email: string;
	};

	deleteCookie(c, sessionCookieName, {
		path: "/",
	});

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name,
		},
		props: {
			accessToken,
			email,
			name,
		} as Props,
		request: mcpAuthRequestInfo,
		scope: mcpAuthRequestInfo.scope,
		userId: id,
	});

	return Response.redirect(redirectTo);
});

export { app as GoogleHandler };
