import { Agent, routeAgentRequest, type AgentNamespace } from "agents";
import { MCPClientManager } from "agents/mcp/client";
import type {
	Tool,
	Prompt,
	Resource,
} from "@modelcontextprotocol/sdk/types.js";

type Env = {
	MyAgent: AgentNamespace<MyAgent>;
	HOST: string;
};

export type Server = {
	url: string;
	state: "authenticating" | "connecting" | "ready" | "discovering" | "failed";
	authUrl?: string;
};

export type State = {
	servers: Record<string, Server>;
	tools: (Tool & { serverId: string })[];
	prompts: (Prompt & { serverId: string })[];
	resources: (Resource & { serverId: string })[];
};

export class MyAgent extends Agent<Env, State> {
	initialState = {
		servers: {},
		tools: [],
		prompts: [],
		resources: [],
	};

	setServerState(id: string, state: Server) {
		this.setState({
			...this.state,
			servers: {
				...this.state.servers,
				[id]: state,
			},
		});
	}

	async refreshServerData() {
		this.setState({
			...this.state,
			prompts: this.mcp.listPrompts(),
			tools: this.mcp.listTools(),
			resources: this.mcp.listResources(),
		});
	}

	async onRequest(request: Request): Promise<Response> {
		if (this.mcp.isCallbackRequest(request)) {
			try {
				const { serverId } = await this.mcp.handleCallbackRequest(request);
				this.setServerState(serverId, {
					url: this.state.servers[serverId].url,
					state: this.mcp.mcpConnections[serverId].connectionState,
				});
				await this.refreshServerData();
				// Hack: autoclosing window because a redirect fails for some reason
				// return Response.redirect('http://localhost:5173/', 301)
				return new Response("<script>window.close();</script>", {
					status: 200,
					headers: { "content-type": "text/html" },
				});
			} catch (e: any) {
				return new Response(e, { status: 401 });
			}
		}

		const reqUrl = new URL(request.url);
		if (reqUrl.pathname.endsWith("/add-mcp") && request.method === "POST") {
			const mcpServer = (await request.json()) as { url: string };
			const { authUrl } = await this.addMcpServer(
				"my-mcp-server",
				mcpServer.url,
				this.env.HOST
			);
			return new Response(authUrl, { status: 200 });
		}

		return new Response("Not found", { status: 404 });
	}
}

export default {
	async fetch(request: Request, env: Env) {
		return (
			(await routeAgentRequest(request, env, { cors: true })) ||
			new Response("Not found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
