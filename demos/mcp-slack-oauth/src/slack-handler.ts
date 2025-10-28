import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { generatePKCECodes, verifyPKCE } from "./pkce";
import { getUpstreamAuthorizeUrl } from "./utils";

export type AuthInteractionSession = {
	upstreamState: string; // For upstream provider state validation
	codeVerifier: string; // For upstream PKCE
	codeChallenge: string; // For upstream PKCE
	mcpAuthRequestInfo: AuthRequest;
};

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	userId: string;
	userName: string;
	teamId: string;
	teamName: string;
	accessToken: string;
	refreshToken: string;
	scope: string;
};

const app = new Hono<{
	Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers };
}>();

const sessionCookieName = "slack-auth-session";

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
		getUpstreamAuthorizeUrl({
			client_id: c.env.SLACK_CLIENT_ID,
			redirect_uri: new URL("/callback", c.req.url).href,
			scope: "channels:history,channels:read,users:read",
			state: upstreamState,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
			upstream_url: "https://slack.com/oauth/v2/authorize",
		}),
		302,
	);
});

type SlackOauthTokenResponse =
	| {
			ok: true;
			app_id: string;
			authed_user: { id: string; name?: string };
			scope: string;
			token_type: string;
			access_token: string;
			bot_user_id: string;
			refresh_token: string;
			expires_in: number;
			team: { id: string; name: string };
	  }
	| {
			ok: false;
			error: string;
	  };

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Slack after user authentication.
 * It exchanges the temporary code for an access token, then stores user
 * metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	const code = c.req.query("code") as string;

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

	console.log("Attempting token exchange with params:", {
		code_exists: !!code,
		redirect_uri: new URL("/callback", c.req.url).href,
	});

	// Exchange the code for an access token
	const response = await fetch("https://slack.com/api/oauth.v2.access", {
		body: new URLSearchParams({
			client_id: c.env.SLACK_CLIENT_ID,
			client_secret: c.env.SLACK_CLIENT_SECRET,
			code,
			redirect_uri: new URL("/callback", c.req.url).href,
			code_verifier: codeVerifier,
		}).toString(),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.log("Token exchange failed:", response.status, errorText);
		return c.text(`Failed to fetch access token: ${response.status} ${errorText}`, 500);
	}

	const data = (await response.json()) as SlackOauthTokenResponse;
	if (!data.ok) {
		console.log("Slack API error:", data.error);
		return c.text(`Slack API error: ${data.error || "Unknown error"}`, 500);
	}

	const accessToken = data.access_token;
	if (!accessToken) {
		return c.text("Missing access token", 400);
	}

	// Get user info from the Slack API response
	const userId = data.authed_user?.id || "unknown";
	const userName = data.authed_user?.name || "unknown";
	const teamId = data.team?.id || "unknown";
	const teamName = data.team?.name || "unknown";
	const scope = data.scope || "";

	// Clear the session cookie
	deleteCookie(c, sessionCookieName, {
		path: "/",
	});

	console.log("Completing authorization with user:", userId);

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: userName,
		},
		// This will be available on this.props inside SlackMCP
		props: {
			accessToken,
			refreshToken: data.refresh_token,
			scope,
			teamId,
			teamName,
			userId,
			userName,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: userId,
	});

	return Response.redirect(redirectTo, 302);
});

export const SlackHandler = app;

export const refreshSlackToken = async (refresh_token: string): Promise<Partial<Props>> => {
	if (!refresh_token)
		throw new Error(
			`Cannot refresh Slack upstream token without refresh_token. Check your Slack OAuth app is set to use "token rotation".`,
		);

	const response = await fetch("https://slack.com/api/oauth.v2.access", {
		body: new URLSearchParams({
			client_id: env.SLACK_CLIENT_ID,
			client_secret: env.SLACK_CLIENT_SECRET,
			grant_type: "refresh_token",
			refresh_token,
		}).toString(),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.log("Token exchange failed:", response.status, errorText);
		throw new Error(`Failed to refresh token: ${response.status} ${errorText}`);
	}

	const data = (await response.json()) as SlackOauthTokenResponse;
	if (!data.ok) {
		console.log("Slack API error:", data.error);
		throw new Error(`Slack API error: ${data.error || "Unknown error"}`);
	}

	// Return the updated tokens to be stored in props
	return { accessToken: data.access_token, refreshToken: data.refresh_token };
};
