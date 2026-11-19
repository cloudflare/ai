import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { B2BClient } from "stytch";
import type { AuthenticationContext } from "../../types";

let client: B2BClient | null = null;

function getClient(env: Env): B2BClient {
	if (!client) {
		client = new B2BClient({
			project_id: env.STYTCH_PROJECT_ID,
			secret: env.STYTCH_PROJECT_SECRET,
			custom_base_url: `${env.STYTCH_DOMAIN}`,
		});
	}
	return client;
}

export type RBACParams = {
	resource_id: "objective" | "key_result";
	action: "create" | "read" | "update" | "delete";
};
/**
 * stytchAuthMiddleware is a Hono middleware that validates that the user is logged in
 * It checks for the stytch_session_jwt cookie set by the Stytch FE SDK and verifies that the
 * caller has permission to access the specified resource and action within the tenant
 */
export const stytchSessionAuthMiddleware = ({ resource_id, action }: RBACParams) =>
	createMiddleware<{
		Variables: {
			memberID: string;
			organizationID: string;
		};
		Bindings: Env;
	}>(async (c, next) => {
		const sessionCookie = getCookie(c, "stytch_session_jwt") ?? "";

		try {
			// First: Authenticate the Stytch Session JWT and get the caller's request context
			const authRes = await getClient(c.env).sessions.authenticateJwt({
				session_jwt: sessionCookie,
			});

			// Next: Now that hwe have the organization ID we can check that the caller has permission
			// to interact with the supplied resource and action within the org ID
			// Depending on how your API exposes IDs, this is an important step to protect against IDOR vulnerabilities
			// Read the RBAC Guide for more information:
			// https://stytch.com/docs/b2b/guides/rbac/backend
			await getClient(c.env).sessions.authenticateJwt({
				authorization_check: {
					action,
					organization_id: authRes.member_session.organization_id,
					resource_id,
				},
				session_jwt: sessionCookie,
			});
			c.set("memberID", authRes.member_session.member_id);
			c.set("organizationID", authRes.member_session.organization_id);
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

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		const url = new URL(c.req.url);
		const wwwAuthValue = `Bearer error="Unauthorized", error_description="Unauthorized", resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`;
		const responseHeaders = new Headers();

		responseHeaders.set("WWW-Authenticate", wwwAuthValue);
		const res = new Response(null, { status: 401, headers: responseHeaders });
		throw new HTTPException(401, { message: "Missing or invalid access token", res: res });
	}
	const accessToken = authHeader.substring(7);

	try {
		const tokenRes = await getClient(c.env).idp.introspectTokenLocal(accessToken);
		c.executionCtx.props = {
			accessToken,
			organizationID: tokenRes.organization.organization_id,
		};
	} catch (error) {
		console.error(error);
		throw new HTTPException(401, { message: "Unauthenticated" });
	}
	await next();
});

/**
 * stytchRBACEnforcement validates that the caller has permission to access the specified resource and action within the tenant
 * Unlike with REST APIs, MCP APIs are stateful and long-lasting, so authorization needs to be checked on each tool call
 * Instead of during the initial processing of the request
 */
export async function stytchRBACEnforcement(
	env: Env,
	ctx: AuthenticationContext,
	params: RBACParams,
): Promise<void> {
	await getClient(env).idp.introspectTokenLocal(ctx.accessToken, {
		authorization_check: {
			action: params.action,
			organization_id: ctx.organizationID,
			resource_id: params.resource_id,
		},
	});
}

export function getStytchOAuthEndpointUrl(env: Env, endpoint: string): string {
	const baseURL = `${env.STYTCH_DOMAIN}`;
	return `${baseURL}/${endpoint}`;
}
