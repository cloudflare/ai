import { generateText, Output } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { createWorkersAI } from "../src/index";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const structuredOutputHandler = http.post(
	`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
	async () => {
		return HttpResponse.json({
			errors: [],
			messages: [],
			result: {
				response: JSON.stringify({
					recipe: {
						ingredients: [
							{ amount: "200g", name: "spaghetti" },
							{ amount: "300g", name: "minced beef" },
							{ amount: "500ml", name: "tomato sauce" },
							{ amount: "1 medium", name: "onion" },
							{ amount: "2 cloves", name: "garlic" },
						],
						name: "Spaghetti Bolognese",
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
		});
	},
);

const server = setupServer(structuredOutputHandler);

const recipeSchema = z.object({
	recipe: z.object({
		ingredients: z.array(z.object({ amount: z.string(), name: z.string() })),
		name: z.string(),
		steps: z.array(z.string()),
	}),
});

describe("REST API - Structured Output Tests", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should generate structured output with schema (non-streaming)", async () => {
		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		const result = await generateText({
			model: workersai(TEST_MODEL),
			prompt: "Give me a Spaghetti Bolognese recipe",
			output: Output.object({ schema: recipeSchema }),
		});

		const object = result.output;
		expect(object?.recipe.name).toBe("Spaghetti Bolognese");
		expect(object?.recipe.ingredients.length).toBeGreaterThan(0);
		expect(object?.recipe.steps.length).toBeGreaterThan(0);
	});

	it("should forward structured output name and description", async () => {
		let requestBody: any;

		server.use(
			http.post(
				`https://api.cloudflare.com/client/v4/accounts/${TEST_ACCOUNT_ID}/ai/run/${TEST_MODEL}`,
				async ({ request }) => {
					requestBody = await request.json();

					return HttpResponse.json({
						errors: [],
						messages: [],
						result: {
							response: JSON.stringify({
								recipe: {
									ingredients: [{ amount: "200g", name: "spaghetti" }],
									name: "Spaghetti Bolognese",
									steps: ["Cook spaghetti."],
								},
							}),
						},
						success: true,
					});
				},
			),
		);

		const workersai = createWorkersAI({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
		});

		await generateText({
			model: workersai(TEST_MODEL),
			prompt: "Give me a Spaghetti Bolognese recipe",
			output: Output.object({
				description: "A recipe response",
				name: "Recipe",
				schema: recipeSchema,
			}),
		});

		expect(requestBody.response_format).toMatchObject({
			type: "json_schema",
			json_schema: {
				description: "A recipe response",
				name: "Recipe",
				schema: expect.any(Object),
			},
		});
	});
});

describe("Binding - Structured Output Tests", () => {
	it("should generate structured output with schema (non-streaming)", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async (_modelName: string, _inputs: any, _options?: any) => {
					return {
						response: {
							recipe: {
								ingredients: [
									{ amount: "200g", name: "spaghetti" },
									{ amount: "300g", name: "minced beef" },
									{ amount: "500ml", name: "tomato sauce" },
									{ amount: "1 medium", name: "onion" },
									{ amount: "2 cloves", name: "garlic" },
								],
								name: "Spaghetti Bolognese",
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

		const result = await generateText({
			model: workersai(TEST_MODEL),
			prompt: "Give me a Spaghetti Bolognese recipe",
			output: Output.object({ schema: recipeSchema }),
		});

		const object = result.output;
		expect(object?.recipe.name).toBe("Spaghetti Bolognese");
		expect(object?.recipe.ingredients.length).toBeGreaterThan(0);
		expect(object?.recipe.steps.length).toBeGreaterThan(0);
	});
});
