import { generateObject } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import z from "zod";

if (!process.env.CLOUDFLARE_API_TOKEN) {
	throw new Error("CLOUDFLARE_API_TOKEN is not set");
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
}

const workersai = createWorkersAI({
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
	apiKey: process.env.CLOUDFLARE_API_TOKEN,
});

console.log("Generating structured output for a sourdough recipe...");

const { object } = await generateObject({
	// @ts-expect-error - this is a valid model, we need to fix this
	model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
	prompt: "Please give me a recipe for sourdough bread.",
	schema: z.object({
		recipe: z.object({
			ingredients: z.array(z.object({ amount: z.string(), name: z.string() })),
			name: z.string(),
			steps: z.array(z.string()),
		}),
	}),
});

console.log(JSON.stringify(object, null, 2));
