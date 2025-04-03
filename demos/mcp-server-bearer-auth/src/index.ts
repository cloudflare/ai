import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hono } from "hono";
import { layout, homeContent } from "./utils";

type Bindings = Env;

const app = new Hono<{
	Bindings: Bindings;
}>();

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

		// Tool that returns the user's bearer token
		// This is just for demonstration purposes, don't actually create a tool that does this!
		this.server.tool("getToken", {}, async () => ({
			content: [{ type: "text", text: String(`User's token: ${this.props.bearerToken}`) }],
		}));
	}
}

// Render a basic homepage placeholder to make sure the app is up
app.get("/", async (c) => {
	const content = await homeContent(c.req.raw);
	return c.html(layout(content, "MCP Remote Auth Demo - Home"));
});

app.mount("/", (req, env, ctx) => {
	// This could technically be pulled out into a middleware function, but is left here for clarity
	const authHeader = req.headers.get("authorization");
	if (!authHeader) {
		return new Response("Unauthorized", { status: 401 });
	}

	ctx.props = {
		bearerToken: authHeader,
		// could also add arbitrary headers/parameters here to pass into the MCP client
	};

	return MyMCP.mount("/sse").fetch(req, env, ctx);
});

export default app;
