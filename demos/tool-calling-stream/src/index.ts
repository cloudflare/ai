import { Hono } from "hono";
import { cors } from "hono/cors";
import { stepCountIs, streamText, tool } from "ai";
import z from "zod";
import { createWorkersAI } from "workers-ai-provider";
import type { Variables } from "./types/hono";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(cors());
app.get("/", (c) => c.json("ok"));

app.post("/", async (c) => {
	const { prompt } = (await c.req.json()) as { prompt: string };
	const workersai = createWorkersAI({
		apiKey: c.env.CLOUDFLARE_API_TOKEN,
		accountId: c.env.CLOUDFLARE_ACCOUNT_ID,
	});
	const model = workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast");

	const result = streamText({
		model,
		messages: [
			{ role: "system", content: "You are a helpful AI assistant" },
			{ role: "user", content: prompt },
		],
		tools: {
			weather: tool({
				description: "Get the weather in a location",
				inputSchema: z.object({
					location: z.string().describe("The location to get the weather for"),
				}),
				execute: async ({ location }) => ({
					location,
					weather: location === "London" ? "Raining" : "Sunny",
				}),
			}),
		},
		stopWhen: stepCountIs(5),
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
