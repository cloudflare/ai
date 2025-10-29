import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { LogtoConfig } from "@logto/node";
import { LogtoHonoClient, type LogtoUserProps } from "./logto-utils";
import {
	addApprovedClient,
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	renderApprovalDialog,
	validateCSRFToken,
	validateOAuthState,
} from "./workers-oauth-utils";

const app = new Hono<{
	Bindings: Env & {
		OAUTH_PROVIDER: OAuthHelpers;
		OAUTH_KV: KVNamespace;
		COOKIE_ENCRYPTION_KEY: string;
	};
}>();

const logtoConfig: LogtoConfig = {
	endpoint: env.LOGTO_ENDPOINT,
	appId: env.LOGTO_APP_ID,
	appSecret: env.LOGTO_APP_SECRET,
};

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;

	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	// Check if client is already approved
	if (await isClientApproved(c.req.raw, clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
		// Skip approval dialog but still create secure state
		const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
		return redirectToLogto(c.req.raw, stateToken, c.env.OAUTH_KV);
	}

	// Generate CSRF protection for the approval form
	const { token: csrfToken, setCookie } = generateCSRFProtection();

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		csrfToken,
		server: {
			name: "Cloudflare Logto MCP Server",
			logo: "https://avatars.githubusercontent.com/u/84981374?s=200&v=4",
			description: "This is a demo MCP Remote Server using Logto for authentication.",
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

		// Create OAuth state with CSRF protection
		const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);

		return redirectToLogto(c.req.raw, stateToken, c.env.OAUTH_KV, {
			"Set-Cookie": approvedClientCookie,
		});
	} catch (error: any) {
		console.error("POST /authorize error:", error);
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		// Unexpected non-OAuth error
		return c.text(`Internal server error: ${error.message}`, 500);
	}
});

async function redirectToLogto(
	request: Request,
	stateToken: string,
	kv: KVNamespace,
	headers: Record<string, string> = {},
) {
	// Store the state token in the Logto session
	const logtoClient = new LogtoHonoClient(logtoConfig, stateToken, kv);
	const response = await logtoClient.handleSignIn(new URL("/callback", request.url).href);

	// Add any additional headers (like approved client cookie)
	if (Object.keys(headers).length > 0) {
		for (const [key, value] of Object.entries(headers)) {
			response.headers.set(key, value);
		}
	}

	return response;
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Logto after user authentication.
 * It validates the OAuth state, exchanges the authorization code with Logto,
 * then stores user metadata in the 'props' on the token passed down to the client.
 * It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	// Extract state from Logto callback (stored in sessionId)
	const url = new URL(c.req.url);
	const stateFromQuery = url.searchParams.get("state");

	if (!stateFromQuery) {
		return c.text("Missing state parameter", 400);
	}

	// Validate OAuth state (retrieves stored data from KV)
	let oauthReqInfo: AuthRequest;

	try {
		// Create a modified request with the state in the query string
		const modifiedUrl = new URL(c.req.url);
		modifiedUrl.searchParams.set("state", stateFromQuery);
		const modifiedRequest = new Request(modifiedUrl.toString(), c.req.raw);

		const result = await validateOAuthState(modifiedRequest, c.env.OAUTH_KV);
		oauthReqInfo = result.oauthReqInfo;
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

	// Handle Logto sign-in callback
	const logtoClient = new LogtoHonoClient(logtoConfig, stateFromQuery, c.env.OAUTH_KV);
	await logtoClient.handleSignInCallback(c.req.raw.url);

	// Get the ID token claims after the sign in callback has been handled
	const { sub, email, username } = await logtoClient.getIdTokenClaims();

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: username || email || sub,
		},
		// This will be available on this.props inside MyMCP
		props: {
			email,
			userId: sub,
			username,
		} as LogtoUserProps,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: sub,
	});

	return Response.redirect(redirectTo, 302);
});

export { app as LogtoHandler };
