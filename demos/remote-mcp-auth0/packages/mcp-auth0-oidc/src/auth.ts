import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import * as oauth from "oauth4webapi";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";

import type { UserProps } from "./types";

type Auth0AuthRequest = {
	codeVerifier: string;
	codeChallenge: string;
	nonce: string;
	state: string;
};

export async function getOidcConfig({
	issuer,
	client_id,
	client_secret,
}: { issuer: string; client_id: string; client_secret: string }) {
	const as = await oauth
		.discoveryRequest(new URL(issuer), { algorithm: "oidc" })
		.then((response) => oauth.processDiscoveryResponse(new URL(issuer), response));

	const client: oauth.Client = { client_id };
	const clientAuth = oauth.ClientSecretPost(client_secret);

	return { as, client, clientAuth };
}

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Authorization Code Flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original request information in KV storage for later retrieval.
 * Then it redirects the user to Auth0's login page with the appropriate
 * parameters so the user can authenticate and grant permissions.
 */
export async function authorize(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
	const mcpClientAuthRequest = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!mcpClientAuthRequest.clientId) {
		return c.text("Invalid request", 400);
	}

	const { as, client } = await getOidcConfig({
		issuer: `https://${c.env.AUTH0_DOMAIN}/`,
		client_id: c.env.AUTH0_CLIENT_ID,
		client_secret: c.env.AUTH0_CLIENT_SECRET,
	});

	// Generate all that is needed for the Auth0 auth request.
	const codeVerifier = oauth.generateRandomCodeVerifier();
	const auth0AuthRequest: Auth0AuthRequest = {
		nonce: oauth.generateRandomNonce(),
		state: btoa(JSON.stringify(mcpClientAuthRequest)),
		codeVerifier,
		codeChallenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
	};

	// Store the auth request in a cookie.
	setCookie(c, "auth0_auth_request", btoa(JSON.stringify(auth0AuthRequest)), {
		path: "/",
		httpOnly: true,
		secure: c.env.NODE_ENV !== "development",
		sameSite: c.env.NODE_ENV !== "development" ? "none" : "lax",
		maxAge: 60 * 60 * 1, // 1 hour
	});

	// Redirect to Auth0's authorization endpoint.
	const authorizationUrl = new URL(as.authorization_endpoint!);
	authorizationUrl.searchParams.set("client_id", client.client_id);
	authorizationUrl.searchParams.set("redirect_uri", new URL("/callback", c.req.url).href);
	authorizationUrl.searchParams.set("response_type", "code");
	authorizationUrl.searchParams.set("audience", c.env.AUTH0_AUDIENCE);
	authorizationUrl.searchParams.set("scope", c.env.AUTH0_SCOPE);
	authorizationUrl.searchParams.set("code_challenge", auth0AuthRequest.codeChallenge);
	authorizationUrl.searchParams.set("code_challenge_method", "S256");
	authorizationUrl.searchParams.set("nonce", auth0AuthRequest.nonce);
	authorizationUrl.searchParams.set("state", auth0AuthRequest.state);
	return c.redirect(authorizationUrl.href);
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Auth0 after user authentication.
 * It exchanges the authorization code for an id_token, access_token and optionally refresh_token, then stores some
 * user metadata & the tokens as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
export async function callback(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
	// Parse the auth request from the state parameter.
	const mcpClientAuthRequest = JSON.parse(atob(c.req.query("state") as string)) as AuthRequest;
	if (!mcpClientAuthRequest.clientId) {
		return c.text("Invalid state", 400);
	}

	// Parse the Auth0 auth request from the cookie.
	const auth0AuthRequestCookie = await getCookie(c, "auth0_auth_request");
	if (!auth0AuthRequestCookie) {
		return c.text("Invalid transaction state", 400);
	}
	const auth0AuthRequest = JSON.parse(atob(auth0AuthRequestCookie)) as Auth0AuthRequest;

	const { as, client, clientAuth } = await getOidcConfig({
		issuer: `https://${c.env.AUTH0_DOMAIN}/`,
		client_id: c.env.AUTH0_CLIENT_ID,
		client_secret: c.env.AUTH0_CLIENT_SECRET,
	});

	// Perform the Code Exchange.
	const params = oauth.validateAuthResponse(
		as,
		client,
		new URL(c.req.url),
		auth0AuthRequest.state,
	);
	const response = await oauth.authorizationCodeGrantRequest(
		as,
		client,
		clientAuth,
		params,
		new URL("/callback", c.req.url).href,
		auth0AuthRequest.codeVerifier,
	);

	// Process the response.
	const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
		expectedNonce: auth0AuthRequest.nonce,
		requireIdToken: true,
	});

	// Get the claims from the id_token.
	const claims = oauth.getValidatedIdTokenClaims(result);
	if (!claims) {
		return c.text("Received invalid id_token from Auth0", 400);
	}

	// Perform the Code Exchange.
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: mcpClientAuthRequest,
		userId: claims.sub!,
		metadata: {
			label: claims.name || claims.email || claims.sub,
		},
		scope: mcpClientAuthRequest.scope,
		props: {
			claims: claims,
			tokenSet: {
				idToken: result.id_token,
				accessToken: result.access_token,
				refreshToken: result.refresh_token,
			},
		} as UserProps,
	});

	return Response.redirect(redirectTo);
}
