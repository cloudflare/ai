import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Variables } from "./types/hono";

export { RoutingWorkflow } from "./routing-workflow";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(cors());

app.post("/", async (c) => {
	const { prompt } = (await c.req.json()) as { prompt: string };
	const instance = await c.env.ROUTING_WORKFLOW.create({ params: { prompt } });
	const status = await instance.status();
	return c.json({ id: instance.id, details: status });
});

app.get("/:id", async (c) => {
	const instanceId = c.req.param("id");
	if (instanceId) {
		const instance = await c.env.ROUTING_WORKFLOW.get(instanceId);
		const status = await instance.status();
		return c.json({ status });
	}

	return c.json({ error: "Instance ID not provided" }, 400);
});

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
