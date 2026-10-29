// Context from the auth process, encrypted and stored with the grant by the OAuth provider.
// The relay reads it from `ctx.props`. The Google access token is deliberately not kept:
// nothing after sign-in needs it, so it can never leak to the Amat server.
export type Props = {
	sub: string;
	email: string;
	name: string;
};

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const GOOGLE_TIMEOUT_MS = 10_000;

/**
 * Builds the Google authorization URL for the OpenID Connect code flow with PKCE.
 * `prompt=select_account` lets someone signed in to several Google accounts pick the
 * authorized one instead of being refused for the account Google picked.
 */
export function getUpstreamAuthorizeUrl({
	clientId,
	redirectUri,
	state,
	codeChallenge,
}: {
	clientId: string;
	redirectUri: string;
	state: string;
	codeChallenge: string;
}): string {
	const upstream = new URL(GOOGLE_AUTHORIZE_URL);
	upstream.searchParams.set("client_id", clientId);
	upstream.searchParams.set("redirect_uri", redirectUri);
	upstream.searchParams.set("response_type", "code");
	upstream.searchParams.set("scope", "openid email profile");
	upstream.searchParams.set("state", state);
	upstream.searchParams.set("code_challenge", codeChallenge);
	upstream.searchParams.set("code_challenge_method", "S256");
	upstream.searchParams.set("prompt", "select_account");
	return upstream.href;
}

function base64url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 7636 PKCE pair: a 256-bit random verifier and its S256 challenge. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/**
 * Exchanges Google's authorization code for an access token, server to server.
 * Returns null on any failure. Only the HTTP status is logged, never the response body,
 * the code, or a token.
 */
export async function exchangeCodeForAccessToken({
	clientId,
	clientSecret,
	code,
	codeVerifier,
	redirectUri,
}: {
	clientId: string;
	clientSecret: string;
	code: string;
	codeVerifier: string;
	redirectUri: string;
}): Promise<string | null> {
	let resp: Response;
	try {
		resp = await fetch(GOOGLE_TOKEN_URL, {
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				code,
				code_verifier: codeVerifier,
				grant_type: "authorization_code",
				redirect_uri: redirectUri,
			}).toString(),
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			method: "POST",
			redirect: "manual",
			signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
		});
	} catch (error) {
		console.error("google_token_exchange_failed", { reason: errorName(error) });
		return null;
	}
	if (resp.status !== 200) {
		console.error("google_token_exchange_failed", { status: resp.status });
		return null;
	}
	const body = (await resp.json().catch(() => null)) as { access_token?: unknown } | null;
	if (!body || typeof body.access_token !== "string" || body.access_token.length === 0) {
		console.error("google_token_exchange_failed", { reason: "missing_access_token" });
		return null;
	}
	return body.access_token;
}

export type GoogleUser = {
	sub: string;
	email: string;
	emailVerified: boolean;
	name: string;
};

/**
 * Reads the signed-in user from Google's OpenID Connect userinfo endpoint. The access token
 * was just obtained from Google's token endpoint with this Worker's client credentials, so
 * the identity it returns is Google's, never something the browser supplied.
 */
export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser | null> {
	let resp: Response;
	try {
		resp = await fetch(GOOGLE_USERINFO_URL, {
			headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
			redirect: "manual",
			signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
		});
	} catch (error) {
		console.error("google_userinfo_failed", { reason: errorName(error) });
		return null;
	}
	if (resp.status !== 200) {
		console.error("google_userinfo_failed", { status: resp.status });
		return null;
	}
	const info = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
	if (!info || typeof info.sub !== "string" || info.sub.length === 0) {
		console.error("google_userinfo_failed", { reason: "missing_sub" });
		return null;
	}
	return {
		sub: info.sub,
		email: typeof info.email === "string" ? info.email : "",
		// Only a JSON boolean true counts as verified.
		emailVerified: info.email_verified === true,
		name: typeof info.name === "string" ? info.name : "",
	};
}

export type BodyResult = { text: string } | { error: "too_large" | "invalid_utf8" };

/**
 * Reads a request body as UTF-8 text, stopping as soon as it exceeds `maxBytes`, whether
 * or not the client declared a Content-Length.
 */
export async function readBody(request: Request, maxBytes: number): Promise<BodyResult> {
	const declared = Number(request.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) return { error: "too_large" };
	if (!request.body) return { text: "" };

	const chunks: Uint8Array[] = [];
	let total = 0;
	const reader = request.body.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			return { error: "too_large" };
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes) };
	} catch {
		return { error: "invalid_utf8" };
	}
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : "unknown";
}
