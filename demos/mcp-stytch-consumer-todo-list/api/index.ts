import { Hono } from "hono";
import { cors } from "hono/cors";
import { stytchBearerTokenAuthMiddleware } from "./lib/auth";
import { TodoAPI } from "./TodoAPI.ts";
import { createMcpHandler } from "agents/mcp/server";
import { createTodoServer } from "./TodoMCP.ts";

const mcpHandler = createMcpHandler(createTodoServer);

export default new Hono<{ Bindings: Env }>()
	.use(cors())

	// Mount the TODO API underneath us
	.route("/api", TodoAPI)

	// Serve the OAuth Authorization Server response for Dynamic Client Registration
	.get("/.well-known/oauth-protected-resource", async (c) => {
		const url = new URL(c.req.url);
		return c.json({
			resource: url.origin,
			authorization_servers: [`https://${c.env.STYTCH_DOMAIN}`],
		});
	})

	// Let the MCP Server have a go at handling the request
	.use("/mcp/*", stytchBearerTokenAuthMiddleware)
	.all("/mcp", (c) => mcpHandler(c.req.raw, c.env, c.executionCtx))

	// Finally - serve static assets from Vite
	.mount("/", (req, env) => env.ASSETS.fetch(req));
