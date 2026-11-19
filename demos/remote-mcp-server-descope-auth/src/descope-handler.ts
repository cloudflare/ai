import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { fetchDescopeAuthToken, getDescopeAuthorizeUrl, type Props } from "./descope-utils";
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

function base64url(bytes: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(bytes)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Generates a PKCE code_verifier/code_challenge (S256) pair. */
async function generatePkcePair(): Promise<{ codeVerifier: string; codeChallenge: string }> {
	const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
	const codeVerifier = base64url(verifierBytes.buffer);
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
	const codeChallenge = base64url(digest);
	return { codeVerifier, codeChallenge };
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
		return redirectToDescope(c.req.raw, stateToken, c.env.OAUTH_KV, {
			"Set-Cookie": sessionBindingCookie,
		});
	}

	// Generate CSRF protection for the approval form
	const { token: csrfToken, setCookie } = generateCSRFProtection();

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		csrfToken,
		server: {
			description: "This is a demo MCP Remote Server using Descope for authentication.",
			logo: "https://avatars.githubusercontent.com/u/100786013?s=200&v=4",
			name: "Cloudflare Descope MCP Server",
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

		return redirectToDescope(c.req.raw, stateToken, c.env.OAUTH_KV, Object.fromEntries(headers));
	} catch (error: any) {
		console.error("POST /authorize error:", error);
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		// Unexpected non-OAuth error
		return c.text(`Internal server error: ${error.message}`, 500);
	}
});

async function redirectToDescope(
	request: Request,
	stateToken: string,
	kv: KVNamespace,
	headers: Record<string, string> = {},
) {
	let codeChallenge: string | undefined;
	if (env.DESCOPE_ENABLE_PKCE === "true") {
		const { codeVerifier, codeChallenge: challenge } = await generatePkcePair();
		await kv.put(`oauth:pkce:${stateToken}`, codeVerifier, { expirationTtl: 600 });
		codeChallenge = challenge;
	}

	return new Response(null, {
		headers: {
			...headers,
			location: await getDescopeAuthorizeUrl({
				client_id: env.DESCOPE_CLIENT_ID,
				redirect_uri: new URL("/callback", request.url).href,
				issuer_url: env.DESCOPE_ISSUER_URL,
				scope: env.DESCOPE_SCOPES,
				state: stateToken,
				code_challenge: codeChallenge,
				code_challenge_method: codeChallenge ? "S256" : undefined,
				resource: env.DESCOPE_RESOURCE,
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Descope after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 *
 * SECURITY: This endpoint validates that the state parameter from Descope
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

	// Retrieve the PKCE code_verifier, if one was stashed for this state token
	const stateFromQuery = c.req.query("state");
	let codeVerifier: string | undefined;
	if (stateFromQuery) {
		const pkceKey = `oauth:pkce:${stateFromQuery}`;
		codeVerifier = (await c.env.OAUTH_KV.get(pkceKey)) ?? undefined;
		if (codeVerifier) await c.env.OAUTH_KV.delete(pkceKey);
	}

	// Exchange the code for an access token. For Agentic Identity Hub MCP Server clients, user
	// profile claims come back in the token response's `id_token`, not from a separate userinfo
	// call (that endpoint doesn't resolve applications identified by the agentic issuer format).
	const [tokenResult, errResponse] = await fetchDescopeAuthToken({
		client_id: c.env.DESCOPE_CLIENT_ID,
		client_secret: c.env.DESCOPE_CLIENT_SECRET,
		code: c.req.query("code"),
		redirect_uri: new URL("/callback", c.req.url).href,
		issuer_url: c.env.DESCOPE_ISSUER_URL,
		code_verifier: codeVerifier,
		resource: c.env.DESCOPE_RESOURCE,
	});
	if (errResponse) return errResponse;

	const { accessToken, idTokenClaims } = tokenResult;
	const sub = idTokenClaims?.sub ?? "";
	const name = idTokenClaims?.name;
	const email = idTokenClaims?.email;

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name || sub,
		},
		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			email: email || "",
			name: name || "",
			sub,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: sub,
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

export { app as DescopeHandler };
