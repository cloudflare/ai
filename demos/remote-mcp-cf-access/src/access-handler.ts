import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import * as oauth from "oauth4webapi";
import { createOAuthState, lookupOAuthState, OAuthError, type Props } from "./workers-oauth-utils";

type Bindings = Env & { OAUTH_PROVIDER: OAuthHelpers };

let cachedAs: oauth.AuthorizationServer | null = null;

async function getAuthorizationServer(env: Bindings): Promise<oauth.AuthorizationServer> {
	if (cachedAs) return cachedAs;
	const issuerUrl = new URL(env.ACCESS_ISSUER);
	const response = await oauth.discoveryRequest(issuerUrl, { algorithm: "oidc" });
	cachedAs = await oauth.processDiscoveryResponse(issuerUrl, response);
	return cachedAs;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!oauthReqInfo.clientId) return c.text("Invalid request", 400);

	const { state, codeChallenge } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
	const as = await getAuthorizationServer(c.env);

	const authUrl = new URL(as.authorization_endpoint!);
	authUrl.searchParams.set("client_id", c.env.ACCESS_CLIENT_ID);
	authUrl.searchParams.set("redirect_uri", new URL("/callback", c.req.url).href);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("scope", "openid email profile");
	authUrl.searchParams.set("state", state);
	authUrl.searchParams.set("code_challenge", codeChallenge);
	authUrl.searchParams.set("code_challenge_method", "S256");

	return c.redirect(authUrl.toString(), 302);
});

app.get("/callback", async (c) => {
	const callbackUrl = new URL(c.req.url);
	const stateParam = callbackUrl.searchParams.get("state");
	if (!stateParam) return c.text("Missing state parameter", 400);

	let oauthReqInfo: Awaited<ReturnType<OAuthHelpers["parseAuthRequest"]>>;
	let codeVerifier: string;
	try {
		({ oauthReqInfo, codeVerifier } = await lookupOAuthState(stateParam, c.env.OAUTH_KV));
	} catch (error) {
		if (error instanceof OAuthError) return error.toResponse();
		return c.text("Internal server error", 500);
	}

	if (!oauthReqInfo.clientId) return c.text("Invalid OAuth request data", 400);

	const as = await getAuthorizationServer(c.env);
	const client: oauth.Client = { client_id: c.env.ACCESS_CLIENT_ID };

	let params: URLSearchParams;
	try {
		params = oauth.validateAuthResponse(as, client, callbackUrl, stateParam);
	} catch (err) {
		return c.text(
			`OAuth error: ${err instanceof Error ? err.message : "Invalid authorization response"}`,
			400,
		);
	}

	const tokenResponse = await oauth.authorizationCodeGrantRequest(
		as,
		client,
		oauth.ClientSecretPost(c.env.ACCESS_CLIENT_SECRET),
		params,
		new URL("/callback", c.req.url).href,
		codeVerifier,
	);

	const result = await oauth.processAuthorizationCodeResponse(as, client, tokenResponse, {
		expectedNonce: oauth.expectNoNonce,
	});

	const claims = oauth.getValidatedIdTokenClaims(result)!;

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: { label: claims.name as string },
		props: {
			accessToken: result.access_token,
			email: claims.email,
			login: claims.sub,
			name: claims.name,
		} as Props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: claims.sub,
	});

	return c.redirect(redirectTo, 302);
});

export const handleAccessRequest = app;
