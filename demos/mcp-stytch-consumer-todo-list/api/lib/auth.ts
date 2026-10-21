import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * stytchAuthMiddleware is a Hono middleware that validates that the user is logged in
 * It checks for the stytch_session_jwt cookie set by the Stytch FE SDK
 */
export const stytchSessionAuthMiddleware = createMiddleware<{
	Variables: {
		userID: string;
	};
	Bindings: Env;
}>(async (c, next) => {
	const sessionCookie = getCookie(c, "stytch_session_jwt");

	try {
		const verifyResult = await validateStytchJWT(sessionCookie ?? "", c.env);
		c.set("userID", verifyResult.payload.sub!);
	} catch (error) {
		console.error(error);
		throw new HTTPException(401, { message: "Unauthenticated" });
	}

	await next();
});

/**
 * stytchBearerTokenAuthMiddleware is a Hono middleware that validates that the request has a Stytch-issued bearer token
 * Tokens are issued to clients at the end of a successful OAuth flow
 */
export const stytchBearerTokenAuthMiddleware = createMiddleware<{
	Bindings: Env;
}>(async (c, next) => {
	const authHeader = c.req.header("Authorization");
	const url = new URL(c.req.url);

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		const wwwAuthValue = `Bearer error="Unauthorized", error_description="Unauthorized", resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`;
		const responseHeaders = new Headers();

		responseHeaders.set("WWW-Authenticate", wwwAuthValue);
		const res = new Response(null, { status: 401, headers: responseHeaders });
		throw new HTTPException(401, { message: "Missing or invalid access token", res: res });
	}
	const accessToken = authHeader.substring(7);

	try {
		const verifyResult = await validateStytchJWT(accessToken, c.env);
		c.executionCtx.props = {
			accessToken,
			claims: verifyResult.payload,
		};
	} catch (error) {
		console.error(error);
		throw new HTTPException(401, { message: "Unauthenticated" });
	}

	await next();
});

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function validateStytchJWT(token: string, env: Env) {
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(getStytchOAuthEndpointUrl(env, ".well-known/jwks.json")));
	}

	return await jwtVerify(token, jwks, {
		algorithms: ["RS256"],
		audience: env.STYTCH_PROJECT_ID,
		issuer: [`https://${env.STYTCH_DOMAIN}`],
		typ: "JWT",
	});
}

export function getStytchOAuthEndpointUrl(env: Env, endpoint: string): string {
	const baseURL = `https://${env.STYTCH_DOMAIN}`;
	return `${baseURL}/${endpoint}`;
}
