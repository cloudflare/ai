import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl } from "./utils";
import type { Props } from "./types";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Clerk OAuth flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original OAuth request information in KV storage for later retrieval.
 * Then it redirects the user to Clerk's authorization page for your app with the appropriate
 * parameters so the user can authenticate.
 */
app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

	if (!oauthReqInfo.clientId) {
		return c.text("Invalid request", 400);
	}

	return Response.redirect(
		getUpstreamAuthorizeUrl({
			upstream_url: `${c.env.CLERK_APP_URL}/oauth/authorize`,
			scopes: c.env.CLERK_OAUTH_SCOPES,
			client_id: c.env.CLERK_APP_CLIENT_ID,
			redirect_uri: new URL("/callback", c.req.url).href,
			state: btoa(JSON.stringify(oauthReqInfo)),
		}),
	);
});

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Clerk after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	// Get the oauthReqInfo out of KV
	const oauthReqInfo = JSON.parse(atob(c.req.query("state") as string)) as AuthRequest;

	if (!oauthReqInfo.clientId) {
		return c.text("Invalid state", 400);
	}

	// Exchange the code for an access token
	const [accessToken, errResponse] = await fetchUpstreamAuthToken({
		upstream_url: `${c.env.CLERK_APP_URL}/oauth/token`,
		client_id: c.env.CLERK_APP_CLIENT_ID,
		client_secret: c.env.CLERK_APP_CLIENT_SECRET,
		code: c.req.query("code"),
		redirect_uri: new URL("/callback", c.req.url).href,
	});

	if (errResponse) return errResponse;

	const props: Props = {
		accessToken,
	};

	const userResponse = await fetch(`${c.env.CLERK_APP_URL}/oauth/userinfo`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!userResponse.ok) {
		return new Response("Failed to fetch user info", { status: 500 });
	}

	const user = (await userResponse.json()) as {
		user_id: string;
	};

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: user.user_id,
		metadata: {},
		scope: oauthReqInfo.scope,
		// This will be available on this.props inside MyMCP
		props,
	});

	return Response.redirect(redirectTo);
});

export const ClerkHandler = app;
