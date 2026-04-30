/**
 * Constructs an authorization URL for Microsoft Entra ID (Azure AD).
 *
 * @param {Object} options
 * @param {string} options.upstream_url - The authorization endpoint URL
 * @param {string} options.client_id - The Azure AD application client ID
 * @param {string} options.redirect_uri - The redirect URI
 * @param {string} options.scope - The requested scopes
 * @param {string} [options.state] - The state parameter
 * @param {string} [options.tenant_id] - The tenant ID (defaults to 'common')
 *
 * @returns {string} The authorization URL
 */
export function getUpstreamAuthorizeUrl({
	upstream_url,
	client_id,
	scope,
	redirect_uri,
	state,
	tenant_id = "common",
}: {
	upstream_url: string;
	client_id: string;
	scope: string;
	redirect_uri: string;
	state?: string;
	tenant_id?: string;
}): string {
	// Replace {tenant} in the URL with actual tenant ID
	const url = upstream_url.replace("{tenant}", tenant_id);
	const upstream = new URL(url);
	
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("scope", scope);
	upstream.searchParams.set("response_type", "code");
	upstream.searchParams.set("response_mode", "query");
	if (state) upstream.searchParams.set("state", state);
	
	return upstream.href;
}

/**
 * Fetches an access token from Microsoft Entra ID token endpoint.
 *
 * @param {Object} options
 * @param {string} options.client_id - The Azure AD application client ID
 * @param {string} options.client_secret - The Azure AD application client secret
 * @param {string} options.code - The authorization code
 * @param {string} options.redirect_uri - The redirect URI
 * @param {string} options.upstream_url - The token endpoint URL
 * @param {string} [options.tenant_id] - The tenant ID (defaults to 'common')
 *
 * @returns {Promise<[string, null] | [null, Response]>} A promise that resolves to an array containing the access token or an error response
 */
export async function fetchUpstreamAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	upstream_url,
	tenant_id = "common",
}: {
	code: string | undefined;
	upstream_url: string;
	client_secret: string;
	redirect_uri: string;
	client_id: string;
	tenant_id?: string;
}): Promise<[string, null] | [null, Response]> {
	if (!code) {
		return [null, new Response("Missing code", { status: 400 })];
	}

	// Replace {tenant} in the URL with actual tenant ID
	const url = upstream_url.replace("{tenant}", tenant_id);

	const body = new URLSearchParams({
		client_id,
		client_secret,
		code,
		redirect_uri,
		grant_type: "authorization_code",
	});

	const resp = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: body.toString(),
	});

	if (!resp.ok) {
		const errorText = await resp.text();
		console.error("Token exchange failed:", errorText);
		return [null, new Response("Failed to fetch access token", { status: 500 })];
	}

	const data = await resp.json() as { access_token?: string; error?: string };
	const accessToken = data.access_token;
	
	if (!accessToken) {
		console.error("No access token in response:", data);
		return [null, new Response("Missing access token", { status: 400 })];
	}

	return [accessToken, null];
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	userPrincipalName: string;
	displayName: string;
	mail: string;
	id: string;
	accessToken: string;
};
