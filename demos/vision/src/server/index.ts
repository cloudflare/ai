import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Variables } from "./types/hono";

import { generateText } from "ai";
import { env } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";

const workersAI = createWorkersAI({
	binding: env.AI,
});

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(cors());

// Health check endpoint
app.get("/", (c) => c.json("ok"));

// Image analysis endpoint
app.post("/analyze", async (c) => {
	try {
		const formData = await c.req.formData();
		const image = formData.get("image") as File;

		if (!image) {
			return c.json({ error: "No image provided" }, 400);
		}

		// // The first time you use the model, you need to accept Meta's terms and conditions
		// // Uncomment this code to agree to the terms and conditions
		// const agreeResponse = await env.AI.run(
		// 	"@cf/meta/llama-3.2-11b-vision-instruct",
		// 	{
		// 		prompt: "agree",
		// 	},
		// );

		const response = await generateText({
			// @ts-expect-error is it not in the types yet?
			model: workersAI("@cf/meta/llama-3.2-11b-vision-instruct"),
			messages: [
				{
					role: "system",
					content:
						"You are a helpful assistant that analyzes images and returns a description of the image.",
				},
				{
					role: "user",
					content: [
						{
							type: "image",
							image: await image.arrayBuffer(),
						},
					],
				},
			],
		});

		return c.json({
			success: true,
			analysis: response.text,
			imageType: image.type,
			imageSize: image.size,
		});
	} catch (error) {
		console.error("Error processing image:", error);
		return c.json({ error: "Failed to process image" }, 500);
	}
});

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
