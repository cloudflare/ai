import { reset } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedEmail, isAllowedRedirectUri, normalizeEmail } from "../src/access";
import { createPkcePair } from "../src/utils";
import {
	AMAT_SECRET,
	AMAT_URL,
	authorizeUrl,
	call,
	CLAUDE_CALLBACK,
	CLIENT_STATE,
	CookieJar,
	env,
	exchangeCode,
	extractHandle,
	getAuthorize,
	getCallback,
	GOOGLE_ACCESS_TOKEN,
	GOOGLE_CODE,
	googleProfile,
	kvKeys,
	mcpRequest,
	mockUpstreams,
	obtainAccessToken,
	ORIGIN,
	postConsent,
	registerClient,
	RESOURCE,
	runAuthorization,
} from "./helpers";

const ALLOWED = [
	"bangaly@nasta-univers.com",
	"aissata@nasta-univers.com",
	"talby@nasta-univers.com",
];

afterEach(async () => {
	vi.restoreAllMocks();
	await reset();
});

function expectNoGrantIssued(callback: Response) {
	const location = callback.headers.get("Location");
	if (location) expect(new URL(location).searchParams.has("code")).toBe(false);
}

describe("access policy", () => {
	it("normalizes addresses by trimming and lowercasing", () => {
		expect(normalizeEmail("  Bangaly@Nasta-Univers.COM \t")).toBe("bangaly@nasta-univers.com");
		expect(isAllowedEmail("  Bangaly@Nasta-Univers.COM ")).toBe(true);
	});

	it("allows exactly the three accounts", () => {
		for (const email of ALLOWED) expect(isAllowedEmail(email)).toBe(true);
		for (const email of [
			"mbalde@nasta-univers.com",
			"bangaly@nasta-univers.com.evil.com",
			"bangaly@nasta-univers.co",
			"bangaly+x@nasta-univers.com",
			"bangaly@gmail.com",
			"",
			undefined,
			null,
			["bangaly@nasta-univers.com"],
		]) {
			expect(isAllowedEmail(email)).toBe(false);
		}
	});

	it("accepts only Claude's redirect URIs", () => {
		expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
		expect(isAllowedRedirectUri("https://claude.com/api/mcp/auth_callback")).toBe(true);
		expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback/")).toBe(false);
		expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(false);
		expect(isAllowedRedirectUri("https://evil.example/api/mcp/auth_callback")).toBe(false);
	});
});

describe("Google sign-in with the allowlist", () => {
	it.each(ALLOWED)("lets %s complete the flow and use the relay", async (email) => {
		const { callback, clientId, googleUrl, upstreams, verifier } = await runAuthorization(
			googleProfile(email),
		);

		expect(googleUrl.searchParams.get("client_id")).toBe("test-google-client-id");
		expect(googleUrl.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/callback`);
		expect(googleUrl.searchParams.get("scope")).toBe("openid email profile");
		expect(googleUrl.searchParams.get("code_challenge_method")).toBe("S256");
		expect(googleUrl.searchParams.has("hd")).toBe(false);

		// The Google code was exchanged with PKCE and the client secret, server side.
		const [tokenCall] = upstreams.googleTokenCalls();
		const tokenForm = new URLSearchParams(tokenCall.body);
		expect(tokenForm.get("code")).toBe(GOOGLE_CODE);
		expect(tokenForm.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(tokenForm.get("redirect_uri")).toBe(`${ORIGIN}/callback`);

		expect(callback.status).toBe(302);
		const location = new URL(callback.headers.get("Location")!);
		expect(location.origin + location.pathname).toBe(CLAUDE_CALLBACK);
		expect(location.searchParams.get("state")).toBe(CLIENT_STATE);
		expect(location.searchParams.get("code")).toBeTruthy();

		const tokenResponse = await exchangeCode(location.href, clientId, verifier);
		expect(tokenResponse.status).toBe(200);
		const tokens = (await tokenResponse.json()) as { access_token: string; token_type: string };
		expect(tokens.token_type.toLowerCase()).toBe("bearer");

		upstreams.spy.mockRestore();
		const relayed = mockUpstreams({
			amat: () => Response.json({ id: 1, jsonrpc: "2.0", result: {} }),
		});
		const response = await call(
			mcpRequest(
				{ id: 1, jsonrpc: "2.0", method: "ping" },
				{ Authorization: `Bearer ${tokens.access_token}` },
			),
		);
		expect(response.status).toBe(200);
		expect(relayed.amatCalls()).toHaveLength(1);
	});

	it("normalizes the address Google returns before checking it", async () => {
		const { callback } = await runAuthorization(googleProfile("  Aissata@Nasta-Univers.COM "));
		expect(callback.status).toBe(302);
		expect(new URL(callback.headers.get("Location")!).searchParams.get("code")).toBeTruthy();
		const [grantKey] = await kvKeys("grant:");
		const grant = (await env.OAUTH_KV.get(grantKey, "json")) as { metadata: { label: string } };
		expect(grant.metadata.label).toBe("aissata@nasta-univers.com");
	});

	it.each([
		"mbalde@nasta-univers.com",
		"intrus@gmail.com",
		"bangaly@nasta-univers.com.evil.com",
		"bangaly+claude@nasta-univers.com",
	])("refuses the verified but unlisted account %s without issuing anything", async (email) => {
		const { callback } = await runAuthorization(googleProfile(email));
		expect(callback.status).toBe(403);
		expectNoGrantIssued(callback);
		const page = await callback.text();
		expect(page).toContain("Accès refusé");
		// The page links back to Claude with an error, never with a code.
		expect(page).toContain("error=access_denied");
		expect(page).not.toMatch(/[?&]code=/);
		expect(await kvKeys("grant:")).toEqual([]);
		expect(await kvKeys("token:")).toEqual([]);
	});

	it.each([
		["false", false],
		["missing", undefined],
		["the string 'true'", "true"],
	])("refuses an allowed address whose verification is %s", async (_label, verified) => {
		const { callback } = await runAuthorization(
			googleProfile("talby@nasta-univers.com", { email_verified: verified }),
		);
		expect(callback.status).toBe(403);
		expectNoGrantIssued(callback);
		expect(await kvKeys("grant:")).toEqual([]);
	});

	it("refuses a Google profile without an email", async () => {
		const { callback } = await runAuthorization(googleProfile("", { email: undefined }));
		expect(callback.status).toBe(403);
		expect(await kvKeys("grant:")).toEqual([]);
	});

	it("does not trust an email supplied by the browser", async () => {
		const upstreams = mockUpstreams({ google: googleProfile("intrus@gmail.com") });
		const clientId = await registerClient();
		const jar = new CookieJar();
		const pkce = await createPkcePair();
		const page = await getAuthorize(
			jar,
			`${authorizeUrl({ clientId, codeChallenge: pkce.challenge })}&email=bangaly@nasta-univers.com`,
		);
		const toGoogle = await postConsent(jar, extractHandle(await page.text()));
		const state = new URL(toGoogle.headers.get("Location")!).searchParams.get("state")!;
		const callback = await call(
			new Request(
				`${ORIGIN}/callback?code=${GOOGLE_CODE}&state=${state}&email=bangaly@nasta-univers.com`,
				{
					headers: {
						Cookie: jar.header(),
						"X-Email": "bangaly@nasta-univers.com",
						"X-Forwarded-Email": "bangaly@nasta-univers.com",
					},
				},
			),
		);
		expect(callback.status).toBe(403);
		expect(await kvKeys("grant:")).toEqual([]);
		upstreams.spy.mockRestore();
	});

	it("returns the user to Claude with access_denied when Google sign-in is cancelled", async () => {
		const upstreams = mockUpstreams({ google: googleProfile("bangaly@nasta-univers.com") });
		const clientId = await registerClient();
		const jar = new CookieJar();
		const pkce = await createPkcePair();
		const page = await getAuthorize(
			jar,
			authorizeUrl({ clientId, codeChallenge: pkce.challenge }),
		);
		const toGoogle = await postConsent(jar, extractHandle(await page.text()));
		const state = new URL(toGoogle.headers.get("Location")!).searchParams.get("state")!;

		const callback = await getCallback(jar, { error: "access_denied", state });
		expect(callback.status).toBe(302);
		const location = new URL(callback.headers.get("Location")!);
		expect(location.origin + location.pathname).toBe(CLAUDE_CALLBACK);
		expect(location.searchParams.get("error")).toBe("access_denied");
		expect(location.searchParams.has("code")).toBe(false);
		expect(upstreams.googleTokenCalls()).toHaveLength(0);
	});

	it("fails closed when Google rejects the code exchange", async () => {
		mockUpstreams({
			google: googleProfile("bangaly@nasta-univers.com"),
			googleTokenStatus: 400,
		});
		const clientId = await registerClient();
		const jar = new CookieJar();
		const pkce = await createPkcePair();
		const page = await getAuthorize(
			jar,
			authorizeUrl({ clientId, codeChallenge: pkce.challenge }),
		);
		const toGoogle = await postConsent(jar, extractHandle(await page.text()));
		const state = new URL(toGoogle.headers.get("Location")!).searchParams.get("state")!;

		const callback = await getCallback(jar, { code: GOOGLE_CODE, state });
		expect(callback.status).toBe(502);
		expectNoGrantIssued(callback);
		expect(await kvKeys("grant:")).toEqual([]);
	});
});

describe("authorization request validation", () => {
	it("refuses a client whose redirect URI is not Claude's, before consent or Google", async () => {
		const upstreams = mockUpstreams();
		const clientId = await registerClient(["http://localhost:6274/oauth/callback"]);
		const pkce = await createPkcePair();
		const jar = new CookieJar();
		const response = await getAuthorize(
			jar,
			authorizeUrl({
				clientId,
				codeChallenge: pkce.challenge,
				redirectUri: "http://localhost:6274/oauth/callback",
			}),
		);
		expect(response.status).toBe(400);
		expect(response.headers.get("Location")).toBeNull();
		expect(await response.text()).toContain("Client non autorisé");
		expect(jar.names()).toEqual([]);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("refuses a redirect URI the client did not register", async () => {
		const clientId = await registerClient(["https://claude.com/api/mcp/auth_callback"]);
		const pkce = await createPkcePair();
		const response = await getAuthorize(
			new CookieJar(),
			authorizeUrl({ clientId, codeChallenge: pkce.challenge, redirectUri: CLAUDE_CALLBACK }),
		);
		expect(response.status).toBe(400);
		expect(response.headers.get("Location")).toBeNull();
	});

	it("refuses an unknown client", async () => {
		const pkce = await createPkcePair();
		const response = await getAuthorize(
			new CookieJar(),
			authorizeUrl({ clientId: "unknown-client", codeChallenge: pkce.challenge }),
		);
		expect(response.status).toBe(400);
	});

	it("refuses a token request for another resource", async () => {
		const clientId = await registerClient();
		const pkce = await createPkcePair();
		const response = await getAuthorize(
			new CookieJar(),
			authorizeUrl({
				clientId,
				codeChallenge: pkce.challenge,
				resource: "https://mcp-amat.nasta-univers.com/mcp",
			}),
		);
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("Location")!);
		expect(location.origin + location.pathname).toBe(CLAUDE_CALLBACK);
		expect(location.searchParams.get("error")).toBe("invalid_target");
		expect(location.searchParams.has("code")).toBe(false);
	});

	it("requires PKCE from the MCP client", async () => {
		const clientId = await registerClient();
		const response = await getAuthorize(new CookieJar(), authorizeUrl({ clientId }));
		expect(response.status).toBe(302);
		expect(new URL(response.headers.get("Location")!).searchParams.get("error")).toBe(
			"invalid_request",
		);
	});
});

describe("CSRF and OAuth state", () => {
	async function consentPage(jar: CookieJar) {
		const clientId = await registerClient();
		const pkce = await createPkcePair();
		const page = await getAuthorize(
			jar,
			authorizeUrl({ clientId, codeChallenge: pkce.challenge }),
		);
		expect(page.status).toBe(200);
		return page;
	}

	it("serves the consent page with anti-framing and no-store headers", async () => {
		const page = await consentPage(new CookieJar());
		expect(page.headers.get("X-Frame-Options")).toBe("DENY");
		expect(page.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
		expect(page.headers.get("Cache-Control")).toBe("no-store");
		expect(page.headers.getSetCookie().some((c) => c.startsWith("__Host-oauth-consent-"))).toBe(
			true,
		);
	});

	it("escapes the client name chosen at registration", async () => {
		const response = await call(
			new Request(`${ORIGIN}/register`, {
				body: JSON.stringify({
					client_name: `<script>alert("x")</script>`,
					redirect_uris: [CLAUDE_CALLBACK],
					token_endpoint_auth_method: "none",
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);
		const { client_id } = (await response.json()) as { client_id: string };
		const pkce = await createPkcePair();
		const page = await getAuthorize(
			new CookieJar(),
			authorizeUrl({ clientId: client_id, codeChallenge: pkce.challenge }),
		);
		const html = await page.text();
		expect(html).not.toContain("<script>");
		expect(html).toContain("&#60;script&#62;");
	});

	it("refuses a consent post without the browser binding cookie", async () => {
		const upstreams = mockUpstreams();
		const page = await consentPage(new CookieJar());
		const response = await postConsent(new CookieJar(), extractHandle(await page.text()));
		expect(response.status).toBe(400);
		expect(response.headers.get("Location")).toBeNull();
		expect(upstreams.calls).toHaveLength(0);
	});

	it("refuses a handle bound to another browser", async () => {
		const victim = new CookieJar();
		const attacker = new CookieJar();
		const victimPage = await consentPage(victim);
		await consentPage(attacker);
		const response = await postConsent(attacker, extractHandle(await victimPage.text()));
		expect(response.status).toBe(400);
	});

	it("refuses a forged handle and a replayed one", async () => {
		const jar = new CookieJar();
		const page = await consentPage(jar);
		const handle = extractHandle(await page.text());
		expect((await postConsent(jar, "forged-handle")).status).toBe(400);

		const first = await postConsent(jar, handle);
		expect(first.status).toBe(302);
		// The binding cookie was cleared and the transaction consumed.
		expect((await postConsent(jar, handle)).status).toBe(400);
	});

	it("sends the user back to Claude with access_denied on Refuser", async () => {
		const upstreams = mockUpstreams();
		const jar = new CookieJar();
		const page = await consentPage(jar);
		const response = await postConsent(jar, extractHandle(await page.text()), "deny");
		expect(response.status).toBe(302);
		const location = new URL(response.headers.get("Location")!);
		expect(location.origin + location.pathname).toBe(CLAUDE_CALLBACK);
		expect(location.searchParams.get("error")).toBe("access_denied");
		expect(upstreams.calls).toHaveLength(0);
	});

	it("sets every cookie in its own Set-Cookie header", async () => {
		const jar = new CookieJar();
		const page = await consentPage(jar);
		const response = await postConsent(jar, extractHandle(await page.text()));
		const cookies = response.headers.getSetCookie();
		// Clears the consent binding and binds the Google state, in two headers.
		expect(cookies).toHaveLength(2);
		expect(
			cookies.some((c) => c.startsWith("__Host-oauth-consent-") && /Max-Age=0/.test(c)),
		).toBe(true);
		expect(cookies.some((c) => c.startsWith("__Host-oauth-upstream-"))).toBe(true);
		for (const cookie of cookies) expect(cookie).toMatch(/; Secure; HttpOnly; SameSite=Lax/);
	});

	it("asks for consent on every authorization and warns about forwarded links", async () => {
		const jar = new CookieJar();
		const clientId = await registerClient();
		const pkce = await createPkcePair();
		const url = authorizeUrl({ clientId, codeChallenge: pkce.challenge });
		const page = await getAuthorize(jar, url);
		await postConsent(jar, extractHandle(await page.text()));

		const again = await getAuthorize(jar, url);
		expect(again.status).toBe(200);
		expect(await again.text()).toContain("Si quelqu'un vous a envoyé ce lien");
	});

	it("refuses an oversized consent form before parsing it", async () => {
		const response = await call(
			new Request(`${ORIGIN}/authorize`, {
				body: new URLSearchParams({ decision: "approve", handle: "x".repeat(10_000) }),
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				method: "POST",
			}),
		);
		expect(response.status).toBe(413);
	});

	it("refuses the Google callback without the state binding cookie", async () => {
		const upstreams = mockUpstreams({ google: googleProfile("bangaly@nasta-univers.com") });
		const jar = new CookieJar();
		const page = await consentPage(jar);
		const toGoogle = await postConsent(jar, extractHandle(await page.text()));
		const state = new URL(toGoogle.headers.get("Location")!).searchParams.get("state")!;

		const response = await getCallback(new CookieJar(), { code: GOOGLE_CODE, state });
		expect(response.status).toBe(400);
		expect(upstreams.googleTokenCalls()).toHaveLength(0);
		expect(await kvKeys("grant:")).toEqual([]);
	});

	it("refuses a forged, missing or replayed state", async () => {
		const upstreams = mockUpstreams({ google: googleProfile("bangaly@nasta-univers.com") });
		const jar = new CookieJar();
		const page = await consentPage(jar);
		const toGoogle = await postConsent(jar, extractHandle(await page.text()));
		const state = new URL(toGoogle.headers.get("Location")!).searchParams.get("state")!;

		expect((await getCallback(jar, { code: GOOGLE_CODE, state: "forged" })).status).toBe(400);
		expect((await getCallback(jar, { code: GOOGLE_CODE })).status).toBe(400);
		expect((await getCallback(jar, { code: GOOGLE_CODE, state })).status).toBe(302);
		expect((await getCallback(jar, { code: GOOGLE_CODE, state })).status).toBe(400);
		expect(upstreams.googleTokenCalls()).toHaveLength(1);
	});
});

describe("MCP access tokens", () => {
	it("challenges a request without a token and never reaches Amat", async () => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await call(mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }));
		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toContain(
			`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
		);
		expect(upstreams.calls).toHaveLength(0);
	});

	it.each([
		["an unknown token", "Bearer abc:def:ghi"],
		["a malformed token", "Bearer not-a-token"],
		["another scheme", "Basic YWRtaW46YWRtaW4="],
		["the Amat shared secret", `Bearer ${AMAT_SECRET}`],
	])("rejects %s", async (_label, authorization) => {
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await call(
			mcpRequest({ id: 1, jsonrpc: "2.0", method: "ping" }, { Authorization: authorization }),
		);
		expect(response.status).toBe(401);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("rejects an expired token", async () => {
		const token = await obtainAccessToken();
		const [key] = await kvKeys("token:");
		const record = (await env.OAUTH_KV.get(key, "json")) as Record<string, unknown>;
		await env.OAUTH_KV.put(key, JSON.stringify({ ...record, expiresAt: 1 }));

		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await call(
			mcpRequest(
				{ id: 1, jsonrpc: "2.0", method: "ping" },
				{ Authorization: `Bearer ${token}` },
			),
		);
		expect(response.status).toBe(401);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("rejects a token bound to another resource", async () => {
		const token = await obtainAccessToken();
		const [key] = await kvKeys("token:");
		const record = (await env.OAUTH_KV.get(key, "json")) as Record<string, unknown>;
		expect(record.audience).toBe(RESOURCE);
		await env.OAUTH_KV.put(
			key,
			JSON.stringify({ ...record, audience: "https://other.example/mcp" }),
		);

		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await call(
			mcpRequest(
				{ id: 1, jsonrpc: "2.0", method: "ping" },
				{ Authorization: `Bearer ${token}` },
			),
		);
		expect(response.status).toBe(401);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("does not accept the token in the query string", async () => {
		const token = await obtainAccessToken();
		const upstreams = mockUpstreams({ amat: () => new Response("should not be called") });
		const response = await call(
			mcpRequest(
				{ id: 1, jsonrpc: "2.0", method: "ping" },
				{},
				`${RESOURCE}?access_token=${encodeURIComponent(token)}`,
			),
		);
		expect(response.status).toBe(401);
		expect(upstreams.calls).toHaveLength(0);
	});

	it("forwards neither the MCP token nor the Google token to Amat", async () => {
		const token = await obtainAccessToken();
		const upstreams = mockUpstreams({
			amat: () => Response.json({ id: 1, jsonrpc: "2.0", result: {} }),
		});
		const response = await call(
			mcpRequest(
				{ id: 1, jsonrpc: "2.0", method: "ping" },
				{ Authorization: `Bearer ${token}`, Cookie: "session=browser-cookie" },
			),
		);
		expect(response.status).toBe(200);
		const [amatCall] = upstreams.amatCalls();
		expect(amatCall.url).toBe(AMAT_URL);
		expect(amatCall.headers.get("X-Access-Token")).toBe(AMAT_SECRET);
		expect(amatCall.headers.has("Authorization")).toBe(false);
		expect(amatCall.headers.has("Cookie")).toBe(false);
		for (const [, value] of amatCall.headers) {
			expect(value).not.toContain(token);
			expect(value).not.toContain(GOOGLE_ACCESS_TOKEN);
		}
		expect(amatCall.body).not.toContain(token);
	});

	it("keeps Google's access token out of the stored grant", async () => {
		await obtainAccessToken();
		for (const key of [...(await kvKeys("grant:")), ...(await kvKeys("token:"))]) {
			expect(await env.OAUTH_KV.get(key)).not.toContain(GOOGLE_ACCESS_TOKEN);
		}
	});
});

describe("logs", () => {
	it("never contain tokens, codes or secrets", async () => {
		const logged: unknown[] = [];
		for (const method of ["log", "info", "warn", "error", "debug"] as const) {
			vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
				logged.push(args);
			});
		}
		const token = await obtainAccessToken();
		const denied = await runAuthorization(googleProfile("intrus@gmail.com"));
		denied.upstreams.spy.mockRestore();
		const upstreams = mockUpstreams({
			amat: () => new Response("upstream failure", { status: 403 }),
		});
		await call(
			mcpRequest(
				{ id: 1, jsonrpc: "2.0", method: "ping" },
				{ Authorization: `Bearer ${token}` },
			),
		);
		upstreams.spy.mockRestore();

		const text = JSON.stringify(logged);
		expect(logged.length).toBeGreaterThan(0);
		for (const secret of [
			token,
			GOOGLE_ACCESS_TOKEN,
			GOOGLE_CODE,
			AMAT_SECRET,
			"test-google-client-secret",
		]) {
			expect(text).not.toContain(secret);
		}
	});
});

describe("discovery", () => {
	it("publishes protected resource metadata for the configured MCP URL", async () => {
		const response = await call(
			new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`),
		);
		expect(response.status).toBe(200);
		const metadata = (await response.json()) as {
			resource: string;
			authorization_servers: string[];
		};
		expect(metadata.resource).toBe(RESOURCE);
		expect(metadata.authorization_servers).toEqual([ORIGIN]);
	});

	it("publishes authorization server metadata with PKCE S256 and registration", async () => {
		const response = await call(
			new Request(`${ORIGIN}/.well-known/oauth-authorization-server`),
		);
		expect(response.status).toBe(200);
		const metadata = (await response.json()) as Record<string, unknown>;
		expect(metadata.authorization_endpoint).toBe(`${ORIGIN}/authorize`);
		expect(metadata.token_endpoint).toBe(`${ORIGIN}/token`);
		expect(metadata.registration_endpoint).toBe(`${ORIGIN}/register`);
		expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
	});
});
