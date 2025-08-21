import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { Variables } from "./types/hono";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(cors());

app.post("/", async (c) => {
	const { prompt } = (await c.req.json()) as { prompt: string };
	const workersai = createWorkersAI({ binding: c.env.AI });
	const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

	const result = streamText({
		model,
		prompt,
	});

	return result.toUIMessageStreamResponse({
		headers: {
			"Content-Type": "text/x-unknown",
			"content-encoding": "identity",
			"transfer-encoding": "chunked",
		},
	});
});

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
