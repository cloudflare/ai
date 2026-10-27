import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from "./utils";
import {
	clientIdAlreadyApproved,
	parseRedirectApproval,
	renderApprovalDialog,
} from "./workers-oauth-utils";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	if (
		await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY)
	) {
		return redirectToMicrosoft(c.req.raw, oauthReqInfo, c.env);
	}

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		server: {
			description: "This MCP Server uses Microsoft Entra ID (Azure AD) for authentication and provides access to Microsoft Graph APIs.",
			logo: "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
			name: "Cloudflare Entra MCP Server",
		},
		state: { oauthReqInfo },
	});
});

app.post("/authorize", async (c) => {
	const { state, headers } = await parseRedirectApproval(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!state.oauthReqInfo) {
		return c.text("Invalid request", 400);
	}

	return redirectToMicrosoft(c.req.raw, state.oauthReqInfo, c.env, headers);
});

function redirectToMicrosoft(
	request: Request,
	oauthReqInfo: AuthRequest,
	env: Env,
	headers: Record<string, string> = {},
) {
	return new Response(null, {
		headers: {
			...headers,
			location: getUpstreamAuthorizeUrl({
				client_id: env.ENTRA_CLIENT_ID,
				redirect_uri: new URL("/callback", request.url).href,
				scope: "https://graph.microsoft.com/.default openid profile email",
				state: btoa(JSON.stringify(oauthReqInfo)),
				tenant_id: env.ENTRA_TENANT_ID,
				upstream_url: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Microsoft after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	// Get the oathReqInfo out of state
	const oauthReqInfo = JSON.parse(atob(c.req.query("state") as string)) as AuthRequest;
	if (!oauthReqInfo.clientId) {
		return c.text("Invalid state", 400);
	}

	// Exchange the code for an access token
	const [accessToken, errResponse] = await fetchUpstreamAuthToken({
		client_id: c.env.ENTRA_CLIENT_ID,
		client_secret: c.env.ENTRA_CLIENT_SECRET,
		code: c.req.query("code"),
		redirect_uri: new URL("/callback", c.req.url).href,
		tenant_id: c.env.ENTRA_TENANT_ID,
		upstream_url: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
	});
	if (errResponse) return errResponse;

	// Fetch the user info from Microsoft Graph
	const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!userResponse.ok) {
		console.error("Failed to fetch user info:", await userResponse.text());
		return c.text("Failed to fetch user info", 500);
	}

	const user = (await userResponse.json()) as {
		id: string;
		displayName: string;
		mail: string;
		userPrincipalName: string;
	};

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: user.displayName,
		},
		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			displayName: user.displayName,
			id: user.id,
			mail: user.mail || user.userPrincipalName,
			userPrincipalName: user.userPrincipalName,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: user.id,
	});

	return Response.redirect(redirectTo);
});

export { app as EntraHandler };
