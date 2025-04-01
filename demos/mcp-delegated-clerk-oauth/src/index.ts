import { creatClerkAuthServer } from "./auth-server";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Props } from "./types";

// @fixme Insert your Clerk Instance URL here
const CLERK_INSTANCE_URL = "CLERK_INSTANCE_URL";

export class MyMCP extends McpAgent<Env, unknown, Props> {
	server = new McpServer({
		name: "Clerk OAuth Proxy Demo",
		version: "1.0.0",
	});

	async init() {
		// Hello, world!
		this.server.tool(
			"add",
			"Add two numbers the way only MCP can",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Gets the currently signed in user's info on your Clerk app.
		this.server.tool("get_user", "Get the users info", {}, async () => {
			const accessToken = this.props.accessToken;

			const user = await fetch(`${CLERK_INSTANCE_URL}/oauth/userinfo`, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			}).then((r) => r.json());

			return {
				content: [{ type: "text", text: JSON.stringify(user) }],
			};
		});
	}
}

const clerkAuthServer = creatClerkAuthServer({
	// Utilize Clerk directly for authorization and token endpoints
	authorizeEndpoint: `${CLERK_INSTANCE_URL}/oauth/authorize`,
	tokenEndpoint: `${CLERK_INSTANCE_URL}/oauth/token`,

	// Utilize our own auth registration endpoint hosted on the same worker in our auth service.
	// @fixme Points to localhost, but can be changed to your remote instance.
	registrationEndpoint: "http://localhost:8788/oauth/register",

	// Scopes supported for Clerk.
	scopesSupported: ["profile", "email"],
});

const mcpServerFetch = MyMCP.mount("/sse");

// Middleware to check if the user is authenticated
// Checks the token itself against Clerk's introspection endpoint.
// @fixme Introspection endpoint is not working for Clerk. Default to using the user info endpoint.
clerkAuthServer.use("/sse/*", async (c, next) => {
	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return c.json(
			{
				error: "Unauthorized",
			},
			401
		);
	}

	// Extract token
	const accessToken = authHeader.slice(7);

	const userResponse = await fetch(`${CLERK_INSTANCE_URL}/oauth/userinfo`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!userResponse.ok) {
		return c.json(
			{
				error: "Unauthorized",
			},
			401
		);
	}

	const user = (await userResponse.json()) as {
		user_id: string;
	};

	if (!user.user_id) {
		return c.json(
			{
				error: "Unauthorized",
			},
			401
		);
	}

	// @fixme Introspection endpoint is not working for Clerk. Default to using the user info endpoint.
	// // Create form data for token introspection
	// const formData = new URLSearchParams();
	// formData.append("token_type_hint", "access_token");

	// If you need to check specific scopes
	// formData.append('scope', 'profile email');

	// Call token introspection endpoint
	// const introspectionResponse = await fetch(
	// 	`${CLERK_INSTANCE_URL}/oauth/token_info`,
	// 	{
	// 		method: "POST",
	// 		headers: {
	// 			"Content-Type": "application/x-www-form-urlencoded",
	// 			Authorization: `Bearer ${accessToken}`,
	// 		},
	// 		body: formData,
	// 	}
	// );

	// if (!introspectionResponse.ok) {
	// 	return c.json(
	// 		{
	// 			error: "Unauthorized",
	// 		},
	// 		401
	// 	);
	// }

	// const introspectionResult = (await introspectionResponse.json()) as {
	// 	active: boolean;
	// };

	// // Token introspection returns an "active" boolean indicating if the token is valid
	// if (!introspectionResult.active) {
	// 	return c.json(
	// 		{
	// 			error: "Unauthorized",
	// 		},
	// 		401
	// 	);
	// }

	// @ts-ignore
	c.executionCtx.props = {
		accessToken,
	};

	return next();
});

clerkAuthServer.all("/sse/*", async (c) => {
	// @ts-ignore
	return mcpServerFetch.fetch(c.req.raw, c.env, c.executionCtx);
});

export default clerkAuthServer;
