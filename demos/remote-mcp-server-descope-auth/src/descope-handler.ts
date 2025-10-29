import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import {
	fetchDescopeAuthToken,
	getDescopeAuthorizeUrl,
	getDescopeUserInfo,
	type Props,
} from "./descope-utils";
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

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	// Check if client is already approved
	if (await isClientApproved(c.req.raw, clientId, env.COOKIE_ENCRYPTION_KEY)) {
		// Skip approval dialog but still create secure state
		const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
		return redirectToDescope(c.req.raw, stateToken);
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

		// Create OAuth state with CSRF protection
		const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);

		return redirectToDescope(c.req.raw, stateToken, { "Set-Cookie": approvedClientCookie });
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
	headers: Record<string, string> = {},
) {
	return new Response(null, {
		headers: {
			...headers,
			location: getDescopeAuthorizeUrl({
				project_id: env.DESCOPE_PROJECT_ID,
				redirect_uri: new URL("/callback", request.url).href,
				state: stateToken,
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
 */
app.get("/callback", async (c) => {
	// Validate OAuth state (retrieves stored data from KV)
	let oauthReqInfo: AuthRequest;

	try {
		const result = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
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

	// Exchange the code for an access token
	const [accessToken, errResponse] = await fetchDescopeAuthToken({
		code: c.req.query("code"),
		management_key: c.env.DESCOPE_MANAGEMENT_KEY,
		project_id: c.env.DESCOPE_PROJECT_ID,
		redirect_uri: new URL("/callback", c.req.url).href,
	});
	if (errResponse) return errResponse;

	// Fetch the user info from Descope
	const userInfo = await getDescopeUserInfo(accessToken);
	const { sub, name, email } = userInfo;

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

	return Response.redirect(redirectTo, 302);
});

export { app as DescopeHandler };
