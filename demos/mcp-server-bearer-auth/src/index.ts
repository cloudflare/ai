import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { Hono } from "hono";
import { z } from "zod";
import { homeContent, layout } from "./utils";

const app = new Hono<{
	Bindings: Env;
}>();

type Props = {
	bearerToken: string;
};

function createServer() {
	const server = new McpServer({
		name: "Demo",
		version: "1.0.0",
	});

	server.registerTool(
		"add",
		{ inputSchema: z.object({ a: z.number(), b: z.number() }) },
		async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}),
	);

	// Tool that returns the user's bearer token
	// This is just for demonstration purposes, don't actually create a tool that does this!
	server.registerTool("getToken", {}, async () => {
		const props = getMcpAuthContext()?.props as Props | undefined;
		return {
			content: [{ type: "text", text: `User's token: ${props?.bearerToken}` }],
		};
	});

	return server;
}

// Render a basic homepage placeholder to make sure the app is up
app.get("/", async (c) => {
	const content = await homeContent(c.req.raw);
	return c.html(layout(content, "MCP Remote Auth Demo - Home"));
});

app.all("/mcp", (c) => {
	// This could technically be pulled out into a middleware function, but is left here for clarity
	const authHeader = c.req.header("authorization");
	if (!authHeader) {
		return new Response("Unauthorized", { status: 401 });
	}

	// The handler exposes these props to tools through `getMcpAuthContext()`
	return createMcpHandler(createServer, {
		authContext: {
			props: {
				bearerToken: authHeader,
				// could also add arbitrary headers/parameters here to pass into the MCP client
			},
		},
	})(c.req.raw, c.env, c.executionCtx);
});

export default app;
