import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { AuthInteractionSession } from "./utils";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Octokit } from "octokit";
import { generatePKCECodes, verifyPKCE } from "./pkce";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from "./utils";
import { renderApprovalDialog } from "./workers-oauth-utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

const sessionCookieName = "github-auth-session";

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
			description: "This is a demo MCP Remote Server using GitHub for authentication.",
			logo: "https://avatars.githubusercontent.com/u/314135?s=200&v=4",
			name: "Cloudflare GitHub MCP Server", // optional
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

	// Use a constant-time comparison to prevent timing attacks
	const encoder = new TextEncoder();
	const expectedTokenBuffer = encoder.encode(expectedCsrfToken);
	const receivedTokenBuffer = encoder.encode(csrfToken);

	const areTokensEqual =
		expectedTokenBuffer.length === receivedTokenBuffer.length &&
		crypto.subtle.timingSafeEqual(expectedTokenBuffer, receivedTokenBuffer);

	if (!areTokensEqual) {
		return c.text("Invalid CSRF token", 400);
	}

	if (!mcpAuthRequestInfo) {
		return c.text("Invalid request", 400);
	}

	return redirectToGithub(c.req.raw, interactionSession);
});

async function redirectToGithub(request: Request, interactionSession: AuthInteractionSession) {
	const { upstreamState, codeChallenge, mcpAuthRequestInfo } = interactionSession;
	return new Response(null, {
		headers: {
			location: getUpstreamAuthorizeUrl({
				client_id: env.GITHUB_CLIENT_ID,
				redirect_uri: new URL("/callback", request.url).href,
				scope: "read:user",
				state: upstreamState,
				code_challenge: codeChallenge,
				code_challenge_method: "S256",
				upstream_url: "https://github.com/login/oauth/authorize",
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from GitHub after user authentication.
 * It exchanges the temporary code for an access token, then stores user
 * metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
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

	const [accessToken, errResponse] = await fetchUpstreamAuthToken({
		client_id: c.env.GITHUB_CLIENT_ID,
		client_secret: c.env.GITHUB_CLIENT_SECRET,
		code: c.req.query("code"),
		redirect_uri: new URL("/callback", c.req.url).href,
		upstream_url: "https://github.com/login/oauth/access_token",
		code_verifier: codeVerifier,
	});
	if (errResponse) return errResponse;

	const user = await new Octokit({ auth: accessToken }).rest.users.getAuthenticated();
	const { login, name, email } = user.data;

	// Clear the session cookie
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
			login,
			name,
		} as Props,
		request: mcpAuthRequestInfo,
		scope: mcpAuthRequestInfo.scope,
		userId: login,
	});

	return Response.redirect(redirectTo);
});

export { app as GitHubHandler };
