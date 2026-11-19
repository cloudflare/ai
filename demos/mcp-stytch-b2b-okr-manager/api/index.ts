import { Hono } from "hono";
import { cors } from "hono/cors";
import { stytchBearerTokenAuthMiddleware } from "./lib/auth";
import { OKRAPI } from "./OKRAPI.ts";
import { createMcpHandler } from "agents/mcp/server";
import { createOKRManagerServer } from "./OKRManagerMCP.ts";

const mcpHandler = createMcpHandler(createOKRManagerServer);

export default new Hono<{ Bindings: Env }>()
	.use(cors())

	// Mount the API underneath us
	.route("/api", OKRAPI)

	// Serve the OAuth Authorization Server response for Dynamic Client Registration
	.get("/.well-known/oauth-protected-resource", async (c) => {
		const url = new URL(c.req.url);
		return c.json({
			resource: url.origin,
			authorization_servers: [c.env.STYTCH_DOMAIN],
		});
	})

	// Let the MCP Server have a go at handling the request
	.use("/mcp/*", stytchBearerTokenAuthMiddleware)
	.all("/mcp", (c) => mcpHandler(c.req.raw, c.env, c.executionCtx))

	// Finally - serve static assets from Vite
	.mount("/", (req, env) => env.ASSETS.fetch(req));
