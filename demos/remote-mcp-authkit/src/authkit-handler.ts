import type {
	AuthRequest,
	OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import * as jose from "jose";
import {
	type AccessToken,
	type AuthenticationResponse,
	WorkOS,
} from "@workos-inc/node";
import type { Props } from "./props";

const app = new Hono<{
	Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers };
	Variables: { workOS: WorkOS };
}>();

app.use(async (c, next) => {
	c.set("workOS", new WorkOS(c.env.WORKOS_CLIENT_SECRET));
	await next();
});

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!oauthReqInfo.clientId) {
		return c.text("Invalid request", 400);
	}

	return Response.redirect(
		c.get("workOS").userManagement.getAuthorizationUrl({
			provider: "authkit",
			clientId: c.env.WORKOS_CLIENT_ID,
			redirectUri: new URL("/callback", c.req.url).href,
			state: btoa(JSON.stringify(oauthReqInfo)),
		})
	);
});

app.get("/callback", async (c) => {
	const workOS = c.get("workOS");

	// Get the oathReqInfo out of KV
	const oauthReqInfo = JSON.parse(
		atob(c.req.query("state") as string)
	) as AuthRequest;
	if (!oauthReqInfo.clientId) {
		return c.text("Invalid state", 400);
	}

	const code = c.req.query("code");
	if (!code) {
		return c.text("Missing code", 400);
	}

	let response: AuthenticationResponse;
	try {
		response = await workOS.userManagement.authenticateWithCode({
			clientId: c.env.WORKOS_CLIENT_ID,
			code,
		});
	} catch (error) {
		console.error("Authentication error:", error);
		return c.text("Invalid authorization code", 400);
	}

	const { accessToken, organizationId, refreshToken, user } = response;
	const { permissions = [] } = jose.decodeJwt<AccessToken>(accessToken);

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: user.id,
		metadata: {},
		scope: permissions,

		// This will be available on this.props inside MyMCP
		props: {
			accessToken,
			organizationId,
			permissions,
			refreshToken,
			user,
		} satisfies Props,
	});

	return Response.redirect(redirectTo);
});

export const AuthkitHandler = app;
