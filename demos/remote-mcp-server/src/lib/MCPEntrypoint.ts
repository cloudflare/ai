import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEEdgeTransport } from "./sseEdge";
import { Hono } from "hono";
import { cors } from "hono/cors";

export abstract class DurableMCP<
	T extends Record<string, any> = Record<string, any>,
	Env = unknown,
> extends DurableObject<Env> {
	abstract server: McpServer;
	private transport!: SSEEdgeTransport;
	props!: T;
	initRun = false;

	abstract init(): Promise<void>;

	async _init(props: T) {
		this.props = props;
		if (!this.initRun) {
			this.initRun = true;
			await this.init();
		}
	}

	async onSSE(request: Request): Promise<Response> {
		this.transport = new SSEEdgeTransport(
			"/sse/message",
			this.ctx.id.toString(),
		);
		await this.server.connect(this.transport);
		return this.transport.sseResponse;
	}

	async onMessage(request: Request): Promise<Response> {
		return this.transport.handlePostMessage(request);
	}

	static mount(
		path: string,
		{
			binding = "MCP_OBJECT",
			corsOptions,
		}: {
			binding?: string;
			corsOptions?: Parameters<typeof cors>[0];
		} = {},
	) {
		const router = new Hono<{
			Bindings: { [binding: string]: DurableObjectNamespace<DurableMCP> };
		}>();

		router.get(path, cors(corsOptions), async (c) => {
			const namespace = c.env[binding];
			const object = namespace.get(namespace.newUniqueId());
			// @ts-ignore
			console.log({ props: c.executionCtx.props });
			// @ts-ignore
			object._init(c.executionCtx.props);
			return (await object.onSSE(c.req.raw)) as unknown as Response;
		});

		router.post(path + "/message", cors(corsOptions), async (c) => {
			const namespace = c.env[binding];
			const sessionId = c.req.query("sessionId");
			if (!sessionId) {
				return new Response(
					"Missing sessionId. Expected POST to /sse to initiate new one",
					{ status: 400 },
				);
			}
			const object = namespace.get(namespace.idFromString(sessionId));
			return (await object.onMessage(c.req.raw)) as unknown as Response;
		});

		return router;
	}
}
