import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hono } from "hono";
import { layout, homeContent } from "./utils";
import { DescopeMcpProvider } from "./descope-hono/provider";
import { descopeMcpAuthRouter } from "./descope-hono/router";
import { descopeMcpBearerAuth } from "./descope-hono/middleware/bearerAuth";
import { cors } from "hono/cors";

type Bindings = Env;

type Props = {
	bearerToken: string;
};

type State = null;

export class MyMCP extends McpAgent<Bindings, State, Props> {
	server = new McpServer({
		name: "Demo",
		version: "1.0.0",
	});

	async init() {
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		this.server.tool("getToken", {}, async () => ({
			content: [{ type: "text", text: String(`User's token: ${this.props.bearerToken}`) }],
		}));
	}
}

export default new Hono<{ Bindings: Bindings }>()
	.use(cors({
		origin: "*",
		allowHeaders: ["Content-Type", "Authorization", "mcp-protocol-version"],
		maxAge: 86400,
	}))

	// Render a basic homepage
	.get("/", async (c) => {
		const content = await homeContent(c.req.raw);
		return c.html(layout(content, "MCP Remote Auth Demo - Home"));
	})

	// OAuth routes
	.use("/.well-known/oauth-authorization-server", async (c) => {
		const provider = new DescopeMcpProvider({}, { env: c.env as unknown as Record<string, string> });
		const router = descopeMcpAuthRouter(provider);
		return router.fetch(c.req.raw, c.env, c.executionCtx);
	})
	.all("/authorize", async (c) => {
		const provider = new DescopeMcpProvider({}, { env: c.env as unknown as Record<string, string> });
		const router = descopeMcpAuthRouter(provider);
		return router.fetch(c.req.raw, c.env, c.executionCtx);
	})
	.use("/register", async (c) => {
		const provider = new DescopeMcpProvider({}, { env: c.env as unknown as Record<string, string> });
		const router = descopeMcpAuthRouter(provider);
		return router.fetch(c.req.raw, c.env, c.executionCtx);
	})

	// Protected MCP routes
	.use("/sse/*", async (c, next) => {
		const provider = new DescopeMcpProvider({}, { env: c.env as unknown as Record<string, string> });
		return descopeMcpBearerAuth(provider)(c, next);
	})
	.route("/sse", new Hono().mount("/", (req, env, ctx) => {
		const authHeader = req.headers.get("authorization");
		ctx.props = {
			bearerToken: authHeader,
		};
		return MyMCP.mount("/sse").fetch(req, env, ctx);
	}))
	// Message route
	.use("/message/*", async (c, next) => {
		const provider = new DescopeMcpProvider({}, { env: c.env as unknown as Record<string, string> });
		return descopeMcpBearerAuth(provider)(c, next);
	});