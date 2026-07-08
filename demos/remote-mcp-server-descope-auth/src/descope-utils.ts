/**
 * Constructs an authorization URL for Descope OAuth (Inbound App).
 *
 * @param {Object} options
 * @param {string} options.client_id - The Descope Inbound App Client ID.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} [options.state] - The state parameter.
 *
 * @returns {string} The authorization URL.
 */
export function getDescopeAuthorizeUrl({
	client_id,
	redirect_uri,
	state,
	scope = "openid profile email",
}: {
	client_id: string;
	redirect_uri: string;
	state?: string;
	scope?: string;
}) {
	const upstream = new URL("https://api.descope.com/oauth2/v1/apps/authorize");
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("response_type", "code");
	// The `openid` scope is required for the /apps/userinfo endpoint to accept the
	// resulting access token; `profile`/`email` add the name/email claims.
	// These scopes must be pre-defined on the Inbound App in the Descope Console.
	upstream.searchParams.set("scope", scope);
	if (state) upstream.searchParams.set("state", state);
	return upstream.href;
}

/**
 * Fetches an authorization token from Descope (Inbound App token exchange).
 *
 * @param {Object} options
 * @param {string} options.client_id - The Descope Inbound App Client ID.
 * @param {string} options.client_secret - The Descope Inbound App Client Secret.
 * @param {string} options.code - The authorization code.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 *
 * @returns {Promise<[string, null] | [null, Response]>} A promise that resolves to an array containing the access token or an error response.
 */
export async function fetchDescopeAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
}: {
	code: string | undefined;
	client_id: string;
	client_secret: string;
	redirect_uri: string;
}): Promise<[string, null] | [null, Response]> {
	if (!code) {
		return [null, new Response("Missing code", { status: 400 })];
	}

	const resp = await fetch("https://api.descope.com/oauth2/v1/apps/token", {
		body: new URLSearchParams({
			client_id,
			client_secret,
			code,
			grant_type: "authorization_code",
			redirect_uri,
		}),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});

	if (!resp.ok) {
		const errorText = await resp.text();
		console.error("Descope token error:", errorText);
		return [null, new Response("Failed to fetch access token", { status: 500 })];
	}

	const body = await resp.json();
	const accessToken = body.access_token as string;
	if (!accessToken) {
		return [null, new Response("Missing access token", { status: 400 })];
	}
	return [accessToken, null];
}

/**
 * Fetches user information from Descope.
 *
 * @param {string} accessToken - The access token from Descope.
 *
 * @returns {Promise<DescopeUserInfo>} A promise that resolves to the user info.
 */
export async function getDescopeUserInfo(accessToken: string): Promise<DescopeUserInfo> {
	const resp = await fetch("https://api.descope.com/oauth2/v1/apps/userinfo", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
		method: "GET",
	});

	if (!resp.ok) {
		throw new Error(`Failed to fetch user info: ${resp.statusText}`);
	}

	return resp.json();
}

export interface DescopeUserInfo {
	sub: string;
	name?: string;
	email?: string;
	picture?: string;
	phone?: string;
	[key: string]: any;
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	sub: string;
	name: string;
	email: string;
	accessToken: string;
};
