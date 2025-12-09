/**
 * Constructs an authorization URL for an upstream service.
 *
 * @param {Object} options
 * @param {string} options.upstream_url - The base URL of the upstream service.
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} [options.state] - The state parameter.
 *
 * @returns {string} The authorization URL.
 */
export function getUpstreamAuthorizeUrl({
	upstream_url,
	client_id,
	scope,
	redirect_uri,
	state,
}: {
	upstream_url: string;
	client_id: string;
	scope: string;
	redirect_uri: string;
	state?: string;
}) {
	const upstream = new URL(upstream_url);
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("scope", scope);
	if (state) upstream.searchParams.set("state", state);
	upstream.searchParams.set("response_type", "code");
	return upstream.href;
}

/**
 * Fetches an authorization token from an upstream service.
 *
 * @param {Object} options
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.client_secret - The client secret of the application.
 * @param {string} options.code - The authorization code.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} options.upstream_url - The token endpoint URL of the upstream service.
 *
 * @returns {Promise<[GitHubTokenResponse, null] | [null, Response]>} A promise that resolves to an array containing the token response or an error response.
 */
export async function fetchUpstreamAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	upstream_url,
}: {
	code: string | undefined;
	upstream_url: string;
	client_secret: string;
	redirect_uri: string;
	client_id: string;
}): Promise<[GitHubTokenResponse, null] | [null, Response]> {
	if (!code) {
		return [null, new Response("Missing code", { status: 400 })];
	}

	const resp = await fetch(upstream_url, {
		body: new URLSearchParams({ client_id, client_secret, code, redirect_uri }).toString(),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		},
		method: "POST",
	});
	if (!resp.ok) {
		console.log(await resp.text());
		return [null, new Response("Failed to fetch access token", { status: 500 })];
	}
	const tokenResponse = (await resp.json()) as GitHubTokenResponse;
	if (!tokenResponse.access_token) {
		return [null, new Response("Missing access token", { status: 400 })];
	}
	return [tokenResponse, null];
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	login: string;
	name: string;
	email: string;
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
	refreshTokenExpiresAt?: number;
};

// GitHub OAuth token response
export type GitHubTokenResponse = {
	access_token: string;
	token_type: string;
	scope: string;
	refresh_token?: string;
	expires_in?: number;
	refresh_token_expires_in?: number;
};

/**
 * Refreshes a GitHub OAuth access token using the refresh token.
 * GitHub OAuth Apps must have token expiration enabled for this to work.
 *
 * @see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
 */
export async function refreshUpstreamToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string,
): Promise<GitHubTokenResponse> {
	const response = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		}).toString(),
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error("GitHub token refresh failed:", response.status, errorText);
		throw new Error(`Failed to refresh GitHub token: ${response.status}`);
	}

	const data = (await response.json()) as GitHubTokenResponse;

	if (!data.access_token) {
		throw new Error("GitHub refresh response missing access_token");
	}

	return data;
}

/**
 * Checks if a token is expired or will expire within the buffer period.
 *
 * @param expiresAt - Unix timestamp when the token expires
 * @param bufferSeconds - Refresh if token expires within this many seconds (default: 300 = 5 minutes)
 * @returns true if the token should be refreshed
 */
export function isTokenExpiringSoon(expiresAt?: number, bufferSeconds = 300): boolean {
	if (!expiresAt) return false;
	const now = Math.floor(Date.now() / 1000);
	return expiresAt <= now + bufferSeconds;
}
