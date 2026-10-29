import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env as workerEnv } from "cloudflare:workers";
import { expect, vi } from "vitest";
import worker from "../src/index";
import { createPkcePair } from "../src/utils";

export const env = workerEnv as unknown as Env;

export const ORIGIN = "http://localhost:8788";
export const RESOURCE = `${ORIGIN}/mcp`;
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
export const AMAT_URL = "https://mcp-amat.nasta-univers.com/mcp";
export const AMAT_SECRET = "test-amat-shared-secret";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_ACCESS_TOKEN = "google-access-token-should-never-leave-the-worker";
export const GOOGLE_CODE = "google-authorization-code";
export const CLIENT_STATE = "claude-state-123";

/** Sends a request through the deployed entry point: the OAuth provider and its handlers. */
export async function call(request: Request): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

/** A minimal browser cookie store: enough to replay cookies the Worker set. */
export class CookieJar {
	private cookies = new Map<string, string>();

	store(response: Response): void {
		for (const header of response.headers.getSetCookie()) {
			const [pair, ...attributes] = header.split(";");
			const separator = pair.indexOf("=");
			const name = pair.slice(0, separator).trim();
			const value = pair.slice(separator + 1).trim();
			const expired = attributes.some((attribute) =>
				/^\s*max-age\s*=\s*0\s*$/i.test(attribute),
			);
			if (expired) this.cookies.delete(name);
			else this.cookies.set(name, value);
		}
	}

	header(): string {
		return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
	}

	names(): string[] {
		return [...this.cookies.keys()];
	}
}

export type RecordedFetch = {
	url: string;
	method: string;
	headers: Headers;
	body: string;
	redirect: string;
};

export type AmatHandler = (request: Request, init?: RequestInit) => Response | Promise<Response>;

/**
 * Replaces the global fetch the Worker uses for Google and Amat. `google` is the userinfo
 * document Google returns; any request to another host fails the test.
 */
export function mockUpstreams(
	options: {
		google?: Record<string, unknown>;
		googleTokenStatus?: number;
		amat?: AmatHandler;
	} = {},
) {
	const calls: RecordedFetch[] = [];
	const spy = vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = new Request(input as RequestInfo, init);
			calls.push({
				body: new TextDecoder().decode(await request.clone().arrayBuffer()),
				headers: new Headers(request.headers),
				method: request.method,
				redirect: request.redirect,
				url: request.url,
			});
			if (request.url === GOOGLE_TOKEN_URL && options.google) {
				const status = options.googleTokenStatus ?? 200;
				return status === 200
					? Response.json({
							access_token: GOOGLE_ACCESS_TOKEN,
							expires_in: 3599,
							token_type: "Bearer",
						})
					: Response.json({ error: "invalid_grant" }, { status });
			}
			if (request.url === GOOGLE_USERINFO_URL && options.google) {
				return Response.json(options.google);
			}
			if (options.amat && new URL(request.url).hostname === "mcp-amat.nasta-univers.com") {
				return options.amat(request, init);
			}
			throw new Error(`Unexpected fetch in test: ${request.method} ${request.url}`);
		});
	return {
		calls,
		spy,
		amatCalls: () =>
			calls.filter((c) => new URL(c.url).hostname === "mcp-amat.nasta-univers.com"),
		googleTokenCalls: () => calls.filter((c) => c.url === GOOGLE_TOKEN_URL),
	};
}

export function googleProfile(email: string, overrides: Record<string, unknown> = {}) {
	return { email, email_verified: true, name: "Test User", sub: "1234567890", ...overrides };
}

export async function registerClient(redirectUris: string[] = [CLAUDE_CALLBACK]): Promise<string> {
	const response = await call(
		new Request(`${ORIGIN}/register`, {
			body: JSON.stringify({
				client_name: "Claude",
				grant_types: ["authorization_code", "refresh_token"],
				redirect_uris: redirectUris,
				response_types: ["code"],
				token_endpoint_auth_method: "none",
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}),
	);
	expect(response.status).toBe(201);
	const { client_id } = (await response.json()) as { client_id: string };
	return client_id;
}

export function authorizeUrl(params: {
	clientId: string;
	codeChallenge?: string;
	redirectUri?: string;
	resource?: string;
}): string {
	const url = new URL(`${ORIGIN}/authorize`);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri ?? CLAUDE_CALLBACK);
	url.searchParams.set("state", CLIENT_STATE);
	url.searchParams.set("resource", params.resource ?? RESOURCE);
	if (params.codeChallenge) {
		url.searchParams.set("code_challenge", params.codeChallenge);
		url.searchParams.set("code_challenge_method", "S256");
	}
	return url.href;
}

export async function getAuthorize(jar: CookieJar, url: string): Promise<Response> {
	const response = await call(new Request(url, { headers: { Cookie: jar.header() } }));
	jar.store(response);
	return response;
}

export function extractHandle(html: string): string {
	const match = /name="handle" value="([^"]+)"/.exec(html);
	if (!match) throw new Error("No consent handle in page");
	return match[1];
}

export async function postConsent(
	jar: CookieJar,
	handle: string,
	decision: "approve" | "deny" = "approve",
): Promise<Response> {
	const response = await call(
		new Request(`${ORIGIN}/authorize`, {
			body: new URLSearchParams({ decision, handle }),
			headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.header() },
			method: "POST",
		}),
	);
	jar.store(response);
	return response;
}

export async function getCallback(
	jar: CookieJar,
	params: Record<string, string>,
): Promise<Response> {
	const url = new URL(`${ORIGIN}/callback`);
	for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
	const response = await call(new Request(url, { headers: { Cookie: jar.header() } }));
	jar.store(response);
	return response;
}

/**
 * Runs the browser part of the flow the way Claude's connector triggers it: register,
 * authorize, approve consent, come back from Google. Returns the callback response.
 */
export async function runAuthorization(profile: Record<string, unknown>) {
	const upstreams = mockUpstreams({ google: profile });
	const clientId = await registerClient();
	const pkce = await createPkcePair();
	const jar = new CookieJar();

	const consentPage = await getAuthorize(
		jar,
		authorizeUrl({ clientId, codeChallenge: pkce.challenge }),
	);
	expect(consentPage.status).toBe(200);
	const toGoogle = await postConsent(jar, extractHandle(await consentPage.text()));
	expect(toGoogle.status).toBe(302);
	const googleUrl = new URL(toGoogle.headers.get("Location")!);
	expect(googleUrl.origin + googleUrl.pathname).toBe(
		"https://accounts.google.com/o/oauth2/v2/auth",
	);

	const callback = await getCallback(jar, {
		code: GOOGLE_CODE,
		state: googleUrl.searchParams.get("state")!,
	});
	return { callback, clientId, googleUrl, jar, upstreams, verifier: pkce.verifier };
}

export async function exchangeCode(location: string, clientId: string, verifier: string) {
	const code = new URL(location).searchParams.get("code")!;
	return call(
		new Request(`${ORIGIN}/token`, {
			body: new URLSearchParams({
				client_id: clientId,
				code,
				code_verifier: verifier,
				grant_type: "authorization_code",
				redirect_uri: CLAUDE_CALLBACK,
				resource: RESOURCE,
			}),
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			method: "POST",
		}),
	);
}

/** Completes the whole flow for an allowed account and returns its MCP access token. */
export async function obtainAccessToken(email = "bangaly@nasta-univers.com"): Promise<string> {
	const { callback, clientId, upstreams, verifier } = await runAuthorization(
		googleProfile(email),
	);
	expect(callback.status).toBe(302);
	const tokenResponse = await exchangeCode(callback.headers.get("Location")!, clientId, verifier);
	expect(tokenResponse.status).toBe(200);
	const { access_token } = (await tokenResponse.json()) as { access_token: string };
	upstreams.spy.mockRestore();
	return access_token;
}

export function mcpRequest(
	body: unknown,
	headers: Record<string, string> = {},
	url = RESOURCE,
): Request {
	return new Request(url, {
		body: JSON.stringify(body),
		headers: {
			Accept: "application/json, text/event-stream",
			"Content-Type": "application/json",
			...headers,
		},
		method: "POST",
	});
}

export async function kvKeys(prefix: string): Promise<string[]> {
	const { keys } = await env.OAUTH_KV.list({ prefix });
	return keys.map((key) => key.name);
}
