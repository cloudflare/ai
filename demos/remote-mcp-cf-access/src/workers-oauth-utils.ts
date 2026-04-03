import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import * as oauth from "oauth4webapi";

export class OAuthError extends Error {
	constructor(
		public code: string,
		public description: string,
		public statusCode = 400,
	) {
		super(description);
		this.name = "OAuthError";
	}

	toResponse(): Response {
		return new Response(
			JSON.stringify({
				error: this.code,
				error_description: this.description,
			}),
			{
				status: this.statusCode,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

/**
 * Creates OAuth state and PKCE challenge, storing the verifier in KV.
 * Uses oauth4webapi to generate cryptographically random values.
 */
export async function createOAuthState(
	oauthReqInfo: AuthRequest,
	kv: KVNamespace,
	stateTTL = 600,
): Promise<{ state: string; codeChallenge: string }> {
	const state = oauth.generateRandomState();
	const codeVerifier = oauth.generateRandomCodeVerifier();
	const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);

	await kv.put(`oauth:state:${state}`, JSON.stringify({ oauthReqInfo, codeVerifier }), {
		expirationTtl: stateTTL,
	});

	return { state, codeChallenge };
}

/**
 * Retrieves and consumes OAuth state from KV (one-time use).
 * @throws {OAuthError} If state is not found or expired
 */
export async function lookupOAuthState(
	state: string,
	kv: KVNamespace,
): Promise<{ oauthReqInfo: AuthRequest; codeVerifier: string }> {
	const stored = await kv.get(`oauth:state:${state}`);
	if (!stored) {
		throw new OAuthError("invalid_request", "Invalid or expired state", 400);
	}

	let parsed: { oauthReqInfo: AuthRequest; codeVerifier: string };
	try {
		parsed = JSON.parse(stored);
	} catch {
		throw new OAuthError("server_error", "Invalid state data", 500);
	}

	await kv.delete(`oauth:state:${state}`);
	return parsed;
}

export interface Props {
	accessToken: string;
	email: string;
	login: string;
	name: string;
	[key: string]: unknown;
}
