import { generateObject } from "ai";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createWorkersAI } from "../src/index";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const structuredOutputHandler = http.post(
	`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
	async () => {
		return HttpResponse.json({
			result: {
				response: JSON.stringify({
					recipe: {
						name: "Spaghetti Bolognese",
						ingredients: [
							{ name: "spaghetti", amount: "200g" },
							{ name: "minced beef", amount: "300g" },
							{ name: "tomato sauce", amount: "500ml" },
							{ name: "onion", amount: "1 medium" },
							{ name: "garlic", amount: "2 cloves" },
						],
						steps: [
							"Cook spaghetti.",
							"Fry onion & garlic.",
							"Add minced beef.",
							"Simmer with sauce.",
							"Serve.",
						],
					},
				}),
			},
			success: true,
			errors: [],
			messages: [],
		});
	},
);

const server = setupServer(structuredOutputHandler);

const recipeSchema = z.object({
	recipe: z.object({
		name: z.string(),
		ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
		steps: z.array(z.string()),
	}),
});

describe("REST API - Structured Output Tests", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should generate structured output with schema (non-streaming)", async () => {
		const workersai = createWorkersAI({
			apiKey: TEST_API_KEY,
			accountId: TEST_ACCOUNT_ID,
		});

		const { object } = await generateObject({
			model: workersai(TEST_MODEL),
			schema: recipeSchema,
			prompt: "Give me a Spaghetti Bolognese recipe",
		});

		expect(object.recipe.name).toBe("Spaghetti Bolognese");
		expect(object.recipe.ingredients.length).toBeGreaterThan(0);
		expect(object.recipe.steps.length).toBeGreaterThan(0);
	});
});

describe("Binding - Structured Output Tests", () => {
	it("should generate structured output with schema (non-streaming)", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async (modelName: string, inputs: any, options?: any) => {
					return {
						response: {
							recipe: {
								name: "Spaghetti Bolognese",
								ingredients: [
									{ name: "spaghetti", amount: "200g" },
									{ name: "minced beef", amount: "300g" },
									{ name: "tomato sauce", amount: "500ml" },
									{ name: "onion", amount: "1 medium" },
									{ name: "garlic", amount: "2 cloves" },
								],
								steps: [
									"Cook spaghetti.",
									"Fry onion & garlic.",
									"Add minced beef.",
									"Simmer with sauce.",
									"Serve.",
								],
							},
						},
					};
				},
			},
		});

		const { object } = await generateObject({
			model: workersai(TEST_MODEL),
			schema: recipeSchema,
			prompt: "Give me a Spaghetti Bolognese recipe",
		});

		expect(object.recipe.name).toBe("Spaghetti Bolognese");
		expect(object.recipe.ingredients.length).toBeGreaterThan(0);
		expect(object.recipe.steps.length).toBeGreaterThan(0);
	});
});
