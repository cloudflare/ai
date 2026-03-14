import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AiGatewayDoesNotExist, AiGatewayUnauthorizedError, createAiGateway } from "../src";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_GATEWAY = "my-gateway";

const embedResponse = [0.1, 0.2, 0.3, 0.4, 0.5];
const embedHandler = http.post(
	`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
	async () => {
		return HttpResponse.json({
			object: "list",
			data: [
				{
					object: "embedding",
					index: 0,
					embedding: embedResponse,
				},
			],
			model: "text-embedding-3-small",
			usage: {
				prompt_tokens: 10,
				total_tokens: 10,
			},
		});
	},
);

const embedManyResponse = [
	[0.1, 0.2, 0.3, 0.4, 0.5],
	[0.2, 0.3, 0.4, 0.5, 0.6],
	[0.3, 0.4, 0.5, 0.6, 0.7],
];
const embedManyHandler = http.post(
	`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
	async () => {
		return HttpResponse.json({
			object: "list",
			data: embedManyResponse.map((embedding, index) => ({
				object: "embedding",
				index,
				embedding,
			})),
			model: "text-embedding-3-small",
			usage: {
				prompt_tokens: 30,
				total_tokens: 30,
			},
		});
	},
);

const server = setupServer(embedHandler);

describe("Embedding Tests", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should embed a single value", async () => {
		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = await embed({
			model: aigateway.embedding(openai.embedding("text-embedding-3-small")),
			value: "Hello, world!",
		});
		expect(result.embedding).toEqual(embedResponse);
	});

	it("should embed multiple values", async () => {
		server.use(embedManyHandler);

		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = await embedMany({
			model: aigateway.embedding(openai.embedding("text-embedding-3-small")),
			values: ["Hello", "World", "Test"],
		});
		expect(result.embeddings).toEqual(embedManyResponse);
	});

	it("should work with textEmbedding alias", async () => {
		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = await embed({
			model: aigateway.textEmbedding(openai.textEmbedding("text-embedding-3-small")),
			value: "Hello, world!",
		});
		expect(result.embedding).toEqual(embedResponse);
	});

	it("should work with textEmbeddingModel alias", async () => {
		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = await embed({
			model: aigateway.textEmbeddingModel(openai.textEmbeddingModel("text-embedding-3-small")),
			value: "Hello, world!",
		});
		expect(result.embedding).toEqual(embedResponse);
	});
});

describe("Embedding with Gateway Options", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should pass gateway options through headers", async () => {
		let capturedHeaders: Headers | null = null;

		server.use(
			http.post(
				`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
				async ({ request }) => {
					capturedHeaders = new Headers(request.headers);
					return HttpResponse.json({
						object: "list",
						data: [
							{
								object: "embedding",
								index: 0,
								embedding: embedResponse,
							},
						],
						model: "text-embedding-3-small",
						usage: {
							prompt_tokens: 10,
							total_tokens: 10,
						},
					});
				},
			),
		);

		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			options: {
				cacheTtl: 3600,
				skipCache: true,
				collectLog: true,
				metadata: { userId: "test-user" },
			},
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		await embed({
			model: aigateway.embedding(openai.embedding("text-embedding-3-small")),
			value: "Hello, world!",
		});

		expect(capturedHeaders).not.toBeNull();
		expect(capturedHeaders?.get("cf-cache-ttl")).toBe("3600");
		expect(capturedHeaders?.get("cf-skip-cache")).toBe("true");
		expect(capturedHeaders?.get("cf-aig-collect-log")).toBe("true");
		expect(capturedHeaders?.get("cf-aig-metadata")).toBe('{"userId":"test-user"}');
	});
});

describe("Embedding with Binding", () => {
	it("should work with a binding", async () => {
		const mockBinding = {
			run: async () =>
				new Response(
					JSON.stringify({
						object: "list",
						data: [
							{
								object: "embedding",
								index: 0,
								embedding: embedResponse,
							},
						],
						model: "text-embedding-3-small",
						usage: {
							prompt_tokens: 10,
							total_tokens: 10,
						},
					}),
					{
						headers: { "cf-aig-step": "0" },
					},
				),
		};

		const aigateway = createAiGateway({
			binding: mockBinding,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		const result = await embed({
			model: aigateway.embedding(openai.embedding("text-embedding-3-small")),
			value: "Hello, world!",
		});
		expect(result.embedding).toEqual(embedResponse);
	});
});

describe("Embedding Error Handling", () => {
	beforeAll(() => server.listen());
	afterEach(() => server.resetHandlers());
	afterAll(() => server.close());

	it("should throw AiGatewayDoesNotExist for 400 status with code 2001", async () => {
		server.use(
			http.post(
				`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
				async () => {
					return HttpResponse.json(
						{
							success: false,
							error: [{ code: 2001, message: "Gateway not found" }],
						},
						{ status: 400 },
					);
				},
			),
		);

		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		await expect(
			embed({
				model: aigateway.embedding(openai.embedding("text-embedding-3-small")),
				value: "Hello, world!",
			}),
		).rejects.toThrow(AiGatewayDoesNotExist);
	});

	it("should throw AiGatewayUnauthorizedError for 401 status with code 2009", async () => {
		server.use(
			http.post(
				`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
				async () => {
					return HttpResponse.json(
						{
							success: false,
							error: [{ code: 2009, message: "Unauthorized" }],
						},
						{ status: 401 },
					);
				},
			),
		);

		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		await expect(
			embed({
				model: aigateway.embedding(openai.embedding("text-embedding-3-small")),
				value: "Hello, world!",
			}),
		).rejects.toThrow(AiGatewayUnauthorizedError);
	});
});
