import { experimental_generateImage as generateImage } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createWorkersAI } from "workers-ai-provider";
import type { Variables } from "./types/hono";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(cors());

app.post("/", async (c) => {
	const { prompt } = (await c.req.json()) as { prompt: string };
	const workersai = createWorkersAI({ binding: c.env.AI });

	const { images } = await generateImage({
		model: workersai.image("@cf/bytedance/stable-diffusion-xl-lightning"),
		prompt,
	});

	return c.json({
		data: uint8ArrayToBase64(images[0].uint8Array),
	});
});

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;

function uint8ArrayToBase64(bytes: Uint8Array): string {
	// Convert the Uint8Array to a binary string
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	// Encode the binary string in Base64 and return the result
	return `data:image/png;base64,${btoa(binary)}`;
}
