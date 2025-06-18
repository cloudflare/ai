import { createWorkersAI } from "../../../packages/workers-ai-provider/src";
import { generateObject } from "ai";
import z from "zod";

if (!process.env.CLOUDFLARE_API_TOKEN) {
	throw new Error("CLOUDFLARE_API_TOKEN is not set");
}

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
	throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
}

const workersai = createWorkersAI({
	apiKey: process.env.CLOUDFLARE_API_TOKEN,
	accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
});

console.log("Generating structured output for a sourdough recipe...");

const { object } = await generateObject({
	// @ts-expect-error - this is a valid model, we need to fix this
	model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
	schema: z.object({
		recipe: z.object({
			name: z.string(),
			ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
			steps: z.array(z.string()),
		}),
	}),
	prompt: "Please give me a recipe for sourdough bread.",
});

console.log(JSON.stringify(object, null, 2));
