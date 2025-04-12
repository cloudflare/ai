import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Context, Hono } from "hono";
import { layout, homeContent } from "./utils";
import { DescopeMcpProvider } from "./descope-hono/provider";
import { descopeMcpAuthRouter } from "./descope-hono/router";
import { descopeMcpBearerAuth } from "./descope-hono/middleware/bearerAuth";
import { cors } from "hono/cors";

type Bindings = {
	DESCOPE_PROJECT_ID: string;
	DESCOPE_MANAGEMENT_KEY: string;
	DESCOPE_BASE_URL?: string;
	SERVER_URL: string;
};

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

// Create the main Hono app
const app = new Hono<{ Bindings: Bindings }>();

// Apply CORS middleware
app.use(cors({
	origin: "*",
	allowHeaders: ["Content-Type", "Authorization", "mcp-protocol-version"],
	maxAge: 86400,
}));

// Homepage route
app.get("/", async (c) => {
	const content = await homeContent(c.req.raw);
	return c.html(layout(content, "MCP Remote Auth Demo - Home"));
});

// OAuth routes handler
const handleOAuthRoute = async (c: Context) => {
	const provider = new DescopeMcpProvider({}, { env: c.env })
	const router = descopeMcpAuthRouter(provider);
	return router.fetch(c.req.raw, c.env, c.executionCtx);
};

// OAuth routes
app.use("/.well-known/oauth-authorization-server", handleOAuthRoute);
app.all("/authorize", handleOAuthRoute);
app.use("/register", handleOAuthRoute);

// Protected MCP routes
app.use("/sse/*", descopeMcpBearerAuth());
app.route("/sse", new Hono().mount("/", (req, env, ctx) => {
	const authHeader = req.headers.get("authorization");
	ctx.props = {
		bearerToken: authHeader,
	};
	return MyMCP.mount("/sse").fetch(req, env, ctx);
}));

export default app;