import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Constructs an authorization URL for Descope OAuth (Agentic Identity Hub MCP Server).
 *
 * @param {Object} options
 * @param {string} options.client_id - The Descope MCP Server Client ID.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} options.project_id - The Descope Project ID.
 * @param {string} options.mcp_server_id - The Descope MCP Server ID.
 * @param {string} [options.state] - The state parameter.
 *
 * @returns {string} The authorization URL.
 */
export function getDescopeAuthorizeUrl({
	client_id,
	redirect_uri,
	project_id,
	mcp_server_id,
	state,
	scope = "openid profile email",
	base_url = "https://api.descope.com",
	code_challenge,
	code_challenge_method,
	resource,
}: {
	client_id: string;
	redirect_uri: string;
	project_id: string;
	mcp_server_id: string;
	state?: string;
	scope?: string;
	base_url?: string;
	code_challenge?: string;
	code_challenge_method?: string;
	resource?: string;
}) {
	const upstream = new URL(
		`${base_url}/oauth2/v1/apps/agentic/${project_id}/${mcp_server_id}/authorize`,
	);
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("response_type", "code");
	// `openid` must be requested for Descope to issue an `id_token` alongside the access token.
	// For Agentic Identity Hub MCP Server clients, user profile claims (name/email/sub) are read
	// from that `id_token` (signature-verified, see verifyDescopeIdToken below), not from a
	// separate `/userinfo` call — the userinfo endpoint only resolves applications identified by
	// the plain (non-agentic) issuer format and returns "Third party application not found" for
	// tokens issued via the agentic authorize/token path.
	upstream.searchParams.set("scope", scope);
	if (state) upstream.searchParams.set("state", state);
	if (code_challenge) upstream.searchParams.set("code_challenge", code_challenge);
	if (code_challenge_method)
		upstream.searchParams.set("code_challenge_method", code_challenge_method);
	if (resource) upstream.searchParams.set("resource", resource);
	return upstream.href;
}

export interface DescopeIdTokenClaims {
	sub: string;
	name?: string;
	email?: string;
	picture?: string;
	phone?: string;
	[key: string]: any;
}

export interface DescopeTokenResult {
	accessToken: string;
	idTokenClaims: DescopeIdTokenClaims | null;
}

interface DescopeDiscoveryDocument {
	issuer: string;
	jwks_uri: string;
	[key: string]: any;
}

// Reused across requests within the same warm Worker isolate so the discovery document and
// remote JWKS aren't re-fetched on every callback.
const discoveryCache = new Map<string, DescopeDiscoveryDocument>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Fetches (and caches) the Agentic Identity Hub MCP Server's OIDC discovery document.
 * `jwks_uri` and `issuer` are read from this document rather than hardcoded, since Descope
 * does not document a fixed URL shape for them.
 */
async function getDescopeDiscoveryDocument(
	base_url: string,
	project_id: string,
	mcp_server_id: string,
): Promise<DescopeDiscoveryDocument> {
	const cacheKey = `${base_url}/${project_id}/${mcp_server_id}`;
	const cached = discoveryCache.get(cacheKey);
	if (cached) return cached;

	const resp = await fetch(
		`${base_url}/v1/apps/agentic/${project_id}/${mcp_server_id}/.well-known/openid-configuration`,
	);
	// Descope's discovery endpoint has been observed to return a non-2xx status wrapper while
	// still carrying a valid discovery document in the body, so the body is parsed regardless
	// of resp.ok and only rejected if it's missing the fields verification depends on.
	const doc = (await resp.json()) as DescopeDiscoveryDocument;
	if (!doc.issuer || !doc.jwks_uri) {
		throw new Error(
			`Descope discovery document is missing issuer/jwks_uri (status ${resp.status})`,
		);
	}
	discoveryCache.set(cacheKey, doc);
	return doc;
}

function getJwks(jwks_uri: string) {
	let jwks = jwksCache.get(jwks_uri);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(jwks_uri));
		jwksCache.set(jwks_uri, jwks);
	}
	return jwks;
}

/**
 * Verifies a Descope-issued `id_token`'s signature against the MCP Server's own JWKS, and
 * checks `iss` (must match the discovery document's own issuer) and `aud`. Per standard OIDC
 * semantics, an ID token's audience is the OAuth client it was issued to (`client_id`), NOT the
 * resource/MCP-server URL — that resource-audience requirement applies to the access token, and
 * was confirmed empirically to differ: this MCP Server's id_token carries `aud: [client_id,
 * project_id]`, while its access token carries `aud: [client_id, project_id, resource_url]`.
 * `exp`/`nbf` are enforced by `jwtVerify` itself.
 *
 * Throws (does not fall back to unverified claims) if verification fails for any reason.
 */
async function verifyDescopeIdToken(
	idToken: string,
	base_url: string,
	project_id: string,
	mcp_server_id: string,
	client_id: string,
): Promise<DescopeIdTokenClaims> {
	const discovery = await getDescopeDiscoveryDocument(base_url, project_id, mcp_server_id);
	const jwks = getJwks(discovery.jwks_uri);

	const { payload } = await jwtVerify(idToken, jwks, {
		issuer: discovery.issuer,
		audience: client_id,
	});

	return payload as unknown as DescopeIdTokenClaims;
}

/**
 * Fetches an authorization token from Descope (Agentic Identity Hub MCP Server token exchange).
 *
 * @param {Object} options
 * @param {string} options.client_id - The Descope MCP Server Client ID.
 * @param {string} options.client_secret - The Descope MCP Server Client Secret.
 * @param {string} options.code - The authorization code.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} options.project_id - The Descope Project ID.
 * @param {string} options.mcp_server_id - The Descope MCP Server ID.
 *
 * @returns {Promise<[DescopeTokenResult, null] | [null, Response]>} A promise that resolves to the access token plus verified id_token claims, or an error response.
 */
export async function fetchDescopeAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	project_id,
	mcp_server_id,
	base_url = "https://api.descope.com",
	code_verifier,
	resource,
}: {
	code: string | undefined;
	client_id: string;
	client_secret: string;
	redirect_uri: string;
	project_id: string;
	mcp_server_id: string;
	base_url?: string;
	code_verifier?: string;
	resource?: string;
}): Promise<[DescopeTokenResult, null] | [null, Response]> {
	if (!code) {
		return [null, new Response("Missing code", { status: 400 })];
	}

	const bodyParams: Record<string, string> = {
		client_id,
		client_secret,
		code,
		grant_type: "authorization_code",
		redirect_uri,
	};
	if (code_verifier) bodyParams.code_verifier = code_verifier;
	if (resource) bodyParams.resource = resource;

	const resp = await fetch(
		`${base_url}/oauth2/v1/apps/agentic/${project_id}/${mcp_server_id}/token`,
		{
			body: new URLSearchParams(bodyParams),
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			method: "POST",
		},
	);

	if (!resp.ok) {
		const errorText = await resp.text();
		console.error("Descope token error:", errorText);
		return [null, new Response("Failed to fetch access token", { status: 500 })];
	}

	const body = (await resp.json()) as { access_token?: string; id_token?: string };
	const accessToken = body.access_token as string;
	if (!accessToken) {
		return [null, new Response("Missing access token", { status: 400 })];
	}

	let idTokenClaims: DescopeIdTokenClaims | null = null;
	if (body.id_token) {
		try {
			idTokenClaims = await verifyDescopeIdToken(
				body.id_token,
				base_url,
				project_id,
				mcp_server_id,
				client_id,
			);
		} catch (e) {
			console.error("id_token verification failed:", e);
			return [null, new Response("Failed to verify id_token", { status: 401 })];
		}
	}

	return [{ accessToken, idTokenClaims }, null];
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	sub: string;
	name: string;
	email: string;
	accessToken: string;
};
