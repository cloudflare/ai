import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, type Props } from "./utils";
import { clientIdAlreadyApproved, parseRedirectApproval, renderApprovalDialog } from "./workers-oauth-utils";

const CLOUD_ID_URL = "https://api.atlassian.com/oauth/token/accessible-resources";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	if (
		await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, env.COOKIE_ENCRYPTION_KEY)
	) {
		return redirectToAtlassian(c.req.raw, oauthReqInfo);
	}

	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
		server: {
			description: "This is a demo MCP Remote Server using Atlassian for authentication.",
			name: "Cloudflare Atlassian MCP Server",
		},
		state: { oauthReqInfo },
	});
});

app.post("/authorize", async (c) => {
	const { state, headers } = await parseRedirectApproval(c.req.raw, env.COOKIE_ENCRYPTION_KEY);
	if (!state.oauthReqInfo) {
		return c.text("Invalid request", 400);
	}

	return redirectToAtlassian(c.req.raw, state.oauthReqInfo, headers);
});

async function redirectToAtlassian(
	request: Request,
	oauthReqInfo: AuthRequest,
	headers: Record<string, string> = {},
) {
	return new Response(null, {
		headers: {
			...headers,
			location: getUpstreamAuthorizeUrl({
				client_id: env.CLIENT_ID,
				redirect_uri: new URL("/callback", request.url).href,
				scope: "read:confluence-user",
				state: btoa(JSON.stringify(oauthReqInfo)),
				upstream_url: "https://auth.atlassian.com/authorize",
			}),
		},
		status: 302,
	});
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Atlassian after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get("/callback", async (c) => {
	// Safely parse the OAuth state parameter
	let oauthReqInfo: AuthRequest;
	try {
		const stateParam = c.req.query("state");
		if (!stateParam) {
			return c.text("Missing or invalid state parameter", 400);
		}

		// Validate base64 format before decoding
		if (!/^[A-Za-z0-9+/]*={0,2}$/.test(stateParam)) {
			return c.text("Invalid state parameter format", 400);
		}

		const decodedState = atob(stateParam);
		oauthReqInfo = JSON.parse(decodedState) as AuthRequest;

		// Validate required fields
		if (!oauthReqInfo || typeof oauthReqInfo !== "object" || !oauthReqInfo.clientId) {
			return c.text("Invalid state content", 400);
		}
	} catch (error) {
		console.error("Failed to parse state parameter:", error instanceof Error ? error.message : String(error));
		return c.text("Invalid state parameter", 400);
	}

	// Exchange the code for an access token
	const [accessToken, errResponse] = await fetchUpstreamAuthToken({
		grant_type: "authorization_code",
		client_id: c.env.CLIENT_ID,
		client_secret: c.env.CLIENT_SECRET,
		code: c.req.query("code"),
		redirect_uri: new URL("/callback", c.req.url).href,
		upstream_url: "https://auth.atlassian.com/oauth/token",
	});
	if (errResponse) return errResponse;

	// Get the cloud ID from Atlassian
	const cloudId = await getCloudId(accessToken);
	if (!cloudId) {
		return c.text("Failed to retrieve Atlassian cloud ID", 500);
	}

	// Get user info from Atlassian
	const userInfo = await getUserInfo(accessToken, cloudId);
	if (!userInfo) {
		return c.text("Failed to retrieve Atlassian user info", 500);
	}

	// Return back to the MCP client a new token
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		props: {
			accessToken,
			cloudId,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: userInfo.account_id,
		metadata: {
			label: userInfo.name,
		}
	});

	return Response.redirect(redirectTo);
});

async function getUserInfo(accessToken: string, cloudId: string): Promise<{ account_id: string; name: string } | null> {
	try {
		const response = await fetch(`https://api.atlassian.com/ex/confluence/${cloudId}/rest/api/user/current`, {
			headers: {
				"Authorization": `Bearer ${accessToken}`,
				"Accept": "application/json",
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Failed to get user info: ${response.status} ${response.statusText} - ${errorText}`);
			return null;
		}

		const userInfo = await response.json() as {
			accountId: string;
			email?: string;
			displayName: string;
			publicName: string;
			profilePicture?: {
				path: string;
				width: number;
				height: number;
				isDefault: boolean;
			};
			type: string;
			accountType: string;
			timeZone: string;
			isExternalCollaborator: boolean;
		};

		console.log(`Found user: ${userInfo.displayName} (${userInfo.accountId})`);
		return { account_id: userInfo.accountId, name: userInfo.displayName };
	} catch (error: any) {
		console.error(`Failed to get user info: ${error.message}`);
		return null;
	}
}

async function getCloudId(accessToken: string): Promise<string | null> {
	try {
		const response = await fetch(CLOUD_ID_URL, {
			headers: {
				"Authorization": `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			console.error(`Failed to get cloud ID: ${response.status} ${response.statusText}`);
			return null;
		}

		const resources = await response.json() as Array<{ id: string; name: string; url: string }>;

		if (resources && resources.length > 0) {
			// Use the first cloud site (most users have only one)
			// For users with multiple sites, they might need to specify which one to use
			return resources[0].id;
		} else {
			console.warn("No Atlassian sites found in the response");
			return null;
		}
	} catch (error) {
		console.error(`Failed to get cloud ID: ${error}`);
		return null;
	}
}

export { app as AtlassianHandler };
