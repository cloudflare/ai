import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { WebClient } from "@slack/web-api";
import { getUpstreamAuthorizeUrl } from "./utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Slack OAuth flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original OAuth request information in KV storage for later retrieval.
 * Then it redirects the user to Slack's authorization page with the appropriate
 * parameters so the user can authenticate and grant permissions.
 */
app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!oauthReqInfo.clientId) {
	  return c.text("Invalid request", 400);
	}
  
	return Response.redirect(
	  getUpstreamAuthorizeUrl({
		upstream_url: "https://slack.com/oauth/v2/authorize",
		scope: "channels:history,channels:read,users:read",
		client_id: c.env.SLACK_CLIENT_ID,
		redirect_uri: new URL("/callback", c.req.url).href,
		state: btoa(JSON.stringify(oauthReqInfo)),
	  }),
	);
  });

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
  
	// Get the oauthReqInfo directly from the state parameter
	const state = c.req.query("state");
	if (!state) {
	  return c.text("Missing state", 400);
	}
	
	// Parse the state to get the original OAuth request info
	const oauthReqInfo = JSON.parse(atob(state)) as AuthRequest;
	if (!oauthReqInfo.clientId) {
	  return c.text("Invalid state", 400);
	}
  
	console.log("Attempting token exchange with params:", {
	  redirect_uri: new URL("/callback", c.req.url).href,
	  code_exists: !!code
	});
  
	// Exchange the code for an access token
	const response = await fetch("https://slack.com/api/oauth.v2.access", {
	  method: "POST",
	  headers: {
		"Content-Type": "application/x-www-form-urlencoded",
	  },
	  body: new URLSearchParams({
		client_id: c.env.SLACK_CLIENT_ID,
		client_secret: c.env.SLACK_CLIENT_SECRET,
		code,
		redirect_uri: new URL("/callback", c.req.url).href,
	  }).toString(),
	});
  
	if (!response.ok) {
	  const errorText = await response.text();
	  console.log("Token exchange failed:", response.status, errorText);
	  return c.text(`Failed to fetch access token: ${response.status} ${errorText}`, 500);
	}
  
	const data = await response.json();
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
  
	console.log("Completing authorization with user:", userId);
  
	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
	  request: oauthReqInfo,
	  userId: userId,
	  metadata: {
		label: userName,
	  },
	  scope: oauthReqInfo.scope,
	  // This will be available on this.props inside SlackMCP
	  props: {
		userId,
		userName,
		teamId,
		teamName,
		accessToken,
		scope,
	  },
	});
  
	return Response.redirect(redirectTo);
  });

export const SlackHandler = app;