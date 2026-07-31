import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { verifyToken } from "@clerk/backend";
import { getUpstreamAuthorizeUrl, type Props } from "./utils";
import {
	addApprovedClient,
	bindStateToSession,
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	renderApprovalDialog,
	validateCSRFToken,
	validateOAuthState,
} from "./workers-oauth-utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

/**
 * RFC 9728: OAuth 2.0 Protected Resource Metadata Discovery Endpoint
 *
 * This endpoint is required by the MCP specification (June 2025) to advertise
 * which authorization servers can be used to obtain access tokens for this resource.
 *
 * Claude Desktop uses this endpoint to discover the authorization server URL.
 */
app.get("/.well-known/oauth-protected-resource", (c) => {
	const url = new URL(c.req.raw.url);

	// Force HTTPS for non-localhost domains (same logic as getCallbackUrl)
	if (url.hostname !== "localhost" && !url.hostname.startsWith("127.")) {
		url.protocol = "https:";
	}

	// The resource identifier should be the base URL of this MCP server
	url.pathname = "/";
	url.search = "";
	url.hash = "";
	const resourceUrl = url.href;

	// The authorization server is this same server (since we're both the auth server and resource server)
	const authServerUrl = resourceUrl.slice(0, -1); // Remove trailing slash

	return c.json({
		resource: resourceUrl,
		authorization_servers: [authServerUrl],
		bearer_methods_supported: ["header"],
		scopes_supported: ["mcp:*"]
	});
});

/**
 * Helper to construct the callback URL with proper protocol
 * Handles cases where the worker receives HTTP but the client connected via HTTPS
 * (e.g., Cloudflare tunnels, reverse proxies)
 */
function getCallbackUrl(request: Request): string {
	const url = new URL(request.url);

	// Force HTTPS for non-localhost domains
	// Cloudflare tunnels (*.trycloudflare.com) and Workers (*.workers.dev) always use HTTPS
	if (url.hostname !== "localhost" && !url.hostname.startsWith("127.")) {
		url.protocol = "https:";
	}

	url.pathname = "/callback";
	url.search = ""; // Remove any query parameters
	url.hash = ""; // Remove any hash

	const redirectUri = url.href;
	console.log("[getCallbackUrl] Generated redirect_uri:", redirectUri, "from hostname:", url.hostname);
	return redirectUri;
}

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	// Check if client is already approved
	if (await isClientApproved(c.req.raw, clientId, env.COOKIE_ENCRYPTION_KEY)) {
		// Skip approval dialog but still create secure state and bind to session
		const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);
		return redirectToClerk(c.req.raw, stateToken, { "Set-Cookie": sessionBindingCookie });
	}

	// Generate CSRF protection for the approval form
	const { token: csrfToken, setCookie } = generateCSRFProtection();

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		csrfToken,
		server: {
			description: "This is a demo MCP Remote Server using Clerk for authentication.",
			logo: "https://avatars.githubusercontent.com/u/49538330?s=200&v=4",
			name: "Cloudflare Clerk MCP Server",
		},
		setCookie,
		state: { oauthReqInfo },
	});
});

app.post("/authorize", async (c) => {
	try {
		// Read form data once
		const formData = await c.req.raw.formData();

		// Validate CSRF token
		validateCSRFToken(formData, c.req.raw);

		// Extract state from form data
		const encodedState = formData.get("state");
		if (!encodedState || typeof encodedState !== "string") {
			return c.text("Missing state in form data", 400);
		}

		let state: { oauthReqInfo?: AuthRequest };
		try {
			state = JSON.parse(atob(encodedState));
		} catch (_e) {
			return c.text("Invalid state data", 400);
		}

		if (!state.oauthReqInfo || !state.oauthReqInfo.clientId) {
			return c.text("Invalid request", 400);
		}

		// Add client to approved list
		const approvedClientCookie = await addApprovedClient(
			c.req.raw,
			state.oauthReqInfo.clientId,
			c.env.COOKIE_ENCRYPTION_KEY,
		);

		// Create OAuth state and bind it to this user's session
		const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);

		// Set both cookies: approved client list + session binding
		const headers = new Headers();
		headers.append("Set-Cookie", approvedClientCookie);
		headers.append("Set-Cookie", sessionBindingCookie);

		return redirectToClerk(c.req.raw, stateToken, Object.fromEntries(headers));
	} catch (error: any) {
		console.error("POST /authorize error:", error);
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		// Unexpected non-OAuth error
		return c.text(`Internal server error: ${error.message}`, 500);
	}
});

async function redirectToClerk(
	request: Request,
	stateToken: string,
	headers: Record<string, string> = {},
) {
	const redirectUri = getCallbackUrl(request);
	console.log("[redirectToClerk] Using redirect_uri:", redirectUri);

	return new Response(null, {
		headers: {
			...headers,
			location: getUpstreamAuthorizeUrl({
				client_id: env.CLERK_CLIENT_ID,
				redirect_uri: redirectUri,
				scope: "openid profile email public_metadata",
				state: stateToken,
				upstream_url: `${env.CLERK_FRONTEND_API}/oauth/authorize`,
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Clerk after user authentication.
 * It exchanges the temporary code for tokens (access_token + id_token),
 * verifies the JWT, extracts user data from claims, then stores user
 * metadata as part of the 'props' on the token passed down to the client.
 * It ends by redirecting the client back to _its_ callback URL
 *
 * SECURITY: This endpoint validates that the state parameter from Clerk
 * matches both:
 * 1. A valid state token in KV (proves it was created by our server)
 * 2. The __Host-CONSENTED_STATE cookie (proves THIS browser consented to it)
 *
 * This prevents CSRF attacks where an attacker's state token is injected
 * into a victim's OAuth flow.
 */
app.get("/callback", async (c) => {
	// Validate OAuth state with session binding
	// This checks both KV storage AND the session cookie
	let oauthReqInfo: AuthRequest;
	let clearSessionCookie: string;

	try {
		const result = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
		oauthReqInfo = result.oauthReqInfo;
		clearSessionCookie = result.clearCookie;
	} catch (error: any) {
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		// Unexpected non-OAuth error
		return c.text("Internal server error", 500);
	}

	if (!oauthReqInfo.clientId) {
		return c.text("Invalid OAuth request data", 400);
	}

	const code = c.req.query("code");
	if (!code) {
		return c.text("Missing authorization code", 400);
	}

	// Exchange the code for tokens (access_token + id_token)
	const tokenEndpoint = `${c.env.CLERK_FRONTEND_API}/oauth/token`;
	const basicAuth = btoa(`${c.env.CLERK_CLIENT_ID}:${c.env.CLERK_CLIENT_SECRET}`);
	const redirectUri = getCallbackUrl(c.req.raw);
	console.log("[/callback] Exchanging code with redirect_uri:", redirectUri);

	const tokenResp = await fetch(tokenEndpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${basicAuth}`,
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: code,
			redirect_uri: redirectUri,
		}).toString(),
	});

	if (!tokenResp.ok) {
		console.error("Token exchange failed:", await tokenResp.text());
		return c.text("Failed to exchange authorization code for token", 500);
	}

	const tokenData = await tokenResp.json<{
		access_token: string;
		id_token: string;
		token_type: string;
	}>();

	// Verify the JWT and extract user data from claims
	let verifiedToken;
	try {
		verifiedToken = await verifyToken(tokenData.id_token, {
			secretKey: c.env.CLERK_SECRET_KEY,
		});
	} catch (error: any) {
		console.error("Token verification failed:", error);
		return c.text("Failed to verify token", 500);
	}

	// Extract user data from JWT claims
	const userId = verifiedToken.sub;
	const sessionId = verifiedToken.sid as string;
	const email = verifiedToken.email as string | undefined;
	const firstName = verifiedToken.given_name as string | undefined;
	const lastName = verifiedToken.family_name as string | undefined;
	const imageUrl = verifiedToken.picture as string | undefined;

	// Extract role from public_metadata if available
	console.log("Verified token claims:", verifiedToken);
	const publicMetadata = (verifiedToken.public_metadata as Record<string, unknown>) || {};
	const role = publicMetadata.role as string | undefined;

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: firstName && lastName ? `${firstName} ${lastName}` : email || userId,
		},
		// This will be available on this.props inside MyMCP
		props: {
			userId,
			sessionId,
			email,
			firstName,
			lastName,
			imageUrl,
			role,
			metadata: publicMetadata,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: userId,
	});

	// Clear the session binding cookie (one-time use) by creating response with headers
	const headers = new Headers({ Location: redirectTo });
	if (clearSessionCookie) {
		headers.set("Set-Cookie", clearSessionCookie);
	}

	return new Response(null, {
		status: 302,
		headers,
	});
});

export { app as ClerkHandler };
