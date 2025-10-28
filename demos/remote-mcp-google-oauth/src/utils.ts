import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

/**
 * Constructs an authorization URL for an upstream service.
 *
 * @param {Object} options
 * @param {string} options.upstream_url - The base URL of the upstream service.
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} [options.state] - The state parameter.
 * @param {string} [options.hosted_domain] - The hosted domain parameter.
 *
 * @returns {string} The authorization URL.
 */
export function getUpstreamAuthorizeUrl({
	upstreamUrl,
	clientId,
	scope,
	redirectUri,
	state,
	hostedDomain,
	code_challenge,
	code_challenge_method,
}: {
	upstreamUrl: string;
	clientId: string;
	scope: string;
	redirectUri: string;
	state?: string;
	hostedDomain?: string;
	code_challenge?: string;
	code_challenge_method?: string;
}) {
	const upstream = new URL(upstreamUrl);
	upstream.searchParams.set("client_id", clientId);
	upstream.searchParams.set("redirect_uri", redirectUri);
	upstream.searchParams.set("scope", scope);
	upstream.searchParams.set("response_type", "code");
	if (state) upstream.searchParams.set("state", state);
	if (hostedDomain) upstream.searchParams.set("hd", hostedDomain);
	if (code_challenge) upstream.searchParams.set("code_challenge", code_challenge);
	if (code_challenge_method) upstream.searchParams.set("code_challenge_method", code_challenge_method);
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
 * @param {string} options.grant_type - The grant type.
 *
 * @returns {Promise<[string, null] | [null, Response]>} A promise that resolves to an array containing the access token or an error response.
 */
export async function fetchUpstreamAuthToken({
	clientId,
	clientSecret,
	code,
	redirectUri,
	upstreamUrl,
	grantType,
	code_verifier,
}: {
	code: string | undefined;
	upstreamUrl: string;
	clientSecret: string;
	redirectUri: string;
	clientId: string;
	grantType: string;
	code_verifier?: string;
}): Promise<[string, null] | [null, Response]> {
	if (!code) {
		return [null, new Response("Missing code", { status: 400 })];
	}

	const params = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		code,
		grant_type: grantType,
		redirect_uri: redirectUri,
	});
	if (code_verifier) params.set("code_verifier", code_verifier);

	const resp = await fetch(upstreamUrl, {
		body: params.toString(),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});
	if (!resp.ok) {
		console.log(await resp.text());
		return [null, new Response("Failed to fetch access token", { status: 500 })];
	}

	interface authTokenResponse {
		access_token: string;
	}

	const body = (await resp.json()) as authTokenResponse;
	if (!body.access_token) {
		return [null, new Response("Missing access token", { status: 400 })];
	}
	return [body.access_token, null];
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to the MyMCP as this.props
export type Props = {
	name: string;
	email: string;
	accessToken: string;
};

export type AuthInteractionSession = {
	csrfToken: string; // For consent form CSRF
	upstreamState: string; // For upstream provider state validation
	codeVerifier: string; // For upstream PKCE
	codeChallenge: string; // For upstream PKCE
	mcpAuthRequestInfo: AuthRequest;
};
