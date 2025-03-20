import { Hono } from "hono";
import {
	layout,
	homeContent,
	renderAuthorizeContent,
	renderApproveContent,
} from "./utils";
import type {
	OAuthHelpers,
	AuthRequest,
} from "@cloudflare/workers-oauth-provider";

export type Bindings = Env & {
	OAUTH_PROVIDER: OAuthHelpers;
};

type Variables = {
	isLoggedIn: boolean;
};

const app = new Hono<{
	Bindings: Bindings;
	Variables: Variables;
}>();

// Middleware to check login status (placeholder using random)
app.use("*", async (c, next) => {
	const isLoggedIn = Math.random() > 0.5;
	c.set("isLoggedIn", isLoggedIn);
	await next();
});

// Render a basic homepage placeholder to make sure the app is up
app.get("/", async (c) => {
	const content = await homeContent();
	return c.html(layout(content, "MCP Remote Auth Demo - Home"));
});

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const randomString = crypto.randomUUID();
	const value = JSON.stringify(oauthReqInfo);

	await c.env.OAUTH_KV.put(`login:${randomString}`, value, {
		expirationTtl: 600,
	});

	const oauthScopes = [
		{
			name: "read_profile",
			description: "Read your basic profile information",
		},
		{ name: "read_data", description: "Access your stored data" },
		{ name: "write_data", description: "Create and modify your data" },
	];

	const content = await renderAuthorizeContent(
		oauthScopes,
		randomString,
		c.get("isLoggedIn")
	);

	return c.html(layout(content, "MCP Remote Auth Demo - Authorization"));
});

app.post("/approve", async (c) => {
	const body = await c.req.parseBody();
	const action = body.action as string;
	const randomString = body.randomString as string;
	const email = body.email as string;

	console.log("Approval route called:", {
		action,
		isLoggedIn: c.get("isLoggedIn"),
		body,
	});

	let message: string;
	let status: string;
	let redirectUrl: string;

	if (action === "approve" || action === "login_approve") {
		message = "Authorization approved!";
		status = "success";

		const oauthReqInfo = await c.env.OAUTH_KV.get<AuthRequest>(
			`login:${randomString}`,
			{
				type: "json",
			}
		);
		console.log({ oauthReqInfo2: oauthReqInfo });
		if (!oauthReqInfo) {
			return c.html("INVALID LOGIN");
		}

		const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization(
			{
				request: oauthReqInfo,
				userId: email,
				metadata: {
					label: "Test User",
				},
				scope: oauthReqInfo.scope,
				props: {
					userEmail: email,
				},
			}
		);
		redirectUrl = redirectTo;
	} else {
		message = "Authorization rejected.";
		status = "error";
		redirectUrl = "/";
	}

	const content = await renderApproveContent(message, status, redirectUrl);

	return c.html(
		layout(content, "MCP Remote Auth Demo - Authorization Status")
	);
});

export default app;
