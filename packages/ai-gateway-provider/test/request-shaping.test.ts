import { generateText } from "ai";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CF_TEMP_TOKEN } from "../src/auth";
import { createAzure } from "../src/providers/azure";
import { createOpenAI } from "../src/providers/openai";
import { createAiGateway } from "../src";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_GATEWAY = "my-gateway";
const GATEWAY_URL = `https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`;

function openAiResponse(text = "ok") {
	return {
		id: "resp-test",
		created_at: Math.floor(Date.now() / 1000),
		model: "gpt-4o-mini",
		output: [
			{
				type: "message",
				role: "assistant",
				id: "msg-1",
				content: [{ type: "output_text", text, annotations: [] }],
			},
		],
		incomplete_details: null,
		object: "response",
		usage: { input_tokens: 10, output_tokens: 1, total_tokens: 11 },
	};
}

let captured: { headers: Record<string, string>; body: unknown } = {
	headers: {},
	body: null,
};
const server = setupServer();

describe("REST request shaping", () => {
	beforeAll(() => server.listen());
	afterEach(() => {
		server.resetHandlers();
		captured = { headers: {}, body: null };
	});
	afterAll(() => server.close());

	it("builds gateway entries, strips the injected CF_TEMP_TOKEN, and sets gateway auth", async () => {
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				captured.headers = Object.fromEntries(request.headers);
				captured.body = await request.json();
				return HttpResponse.json(openAiResponse());
			}),
		);

		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		// No apiKey → the wrapper injects CF_TEMP_TOKEN, which the gateway provider
		// must strip before dispatch (the gateway authenticates upstream).
		const openai = createOpenAI();

		await generateText({
			model: aigateway([openai("gpt-4o-mini")]),
			prompt: "hi",
			maxRetries: 0,
		});

		const body = captured.body as Array<{
			provider: string;
			endpoint: string;
			query: { model?: string };
		}>;
		expect(body).toHaveLength(1);
		expect(body[0]?.provider).toBe("openai");
		expect(body[0]?.endpoint).toMatch(/responses|chat\/completions/);
		expect(body[0]?.query.model).toBe("gpt-4o-mini");

		// Gateway auth + content-type set on the outgoing request.
		expect(captured.headers["cf-aig-authorization"]).toBe(`Bearer ${TEST_API_KEY}`);
		expect(captured.headers["content-type"]).toContain("application/json");

		// The fake upstream token never leaves the provider.
		expect(JSON.stringify(captured.body)).not.toContain(CF_TEMP_TOKEN);
	});

	it("merges gateway options into the request headers (cf-aig-*)", async () => {
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				captured.headers = Object.fromEntries(request.headers);
				return HttpResponse.json(openAiResponse());
			}),
		);

		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
			options: { skipCache: true, cacheTtl: 120, byokAlias: "alias-1", zdr: true },
		});
		const openai = createOpenAI({ apiKey: TEST_API_KEY });

		await generateText({
			model: aigateway([openai("gpt-4o-mini")]),
			prompt: "hi",
			maxRetries: 0,
		});

		expect(captured.headers["cf-aig-skip-cache"]).toBe("true");
		expect(captured.headers["cf-aig-cache-ttl"]).toBe("120");
		expect(captured.headers["cf-aig-byok-alias"]).toBe("alias-1");
		expect(captured.headers["cf-aig-zdr"]).toBe("true");
	});

	it("routes Azure responses API v1 URLs through the azure-openai provider entry", async () => {
		server.use(
			http.post(GATEWAY_URL, async ({ request }) => {
				captured.headers = Object.fromEntries(request.headers);
				captured.body = await request.json();
				return HttpResponse.json(openAiResponse());
			}),
		);

		const aigateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});
		const azure = createAzure({
			resourceName: "myresource",
			apiKey: "azure-api-key",
			apiVersion: "2024-02-15-preview",
			useDeploymentBasedUrls: false,
		});

		await generateText({
			model: aigateway(azure.responses("gpt-5.1")),
			prompt: "hi",
			maxRetries: 0,
		});

		const body = captured.body as Array<{
			provider: string;
			endpoint: string;
			query: { model?: string };
		}>;
		expect(body).toHaveLength(1);
		expect(body[0]?.provider).toBe("azure-openai");
		expect(body[0]?.endpoint).toBe(
			"myresource/openai/responses?api-version=2024-02-15-preview",
		);
		expect(body[0]?.query.model).toBe("gpt-5.1");
	});
});

describe("Binding request shaping", () => {
	it("merges gateway options into each binding entry's headers", async () => {
		let bindingData: Array<{ headers: Record<string, string>; provider: string }> = [];
		const aigateway = createAiGateway({
			binding: {
				run: async (data) => {
					bindingData = data as typeof bindingData;
					return new Response(JSON.stringify(openAiResponse()), {
						headers: { "content-type": "application/json" },
					});
				},
			},
			options: { skipCache: true, cacheTtl: 60 },
		});
		const openai = createOpenAI();

		await generateText({
			model: aigateway([openai("gpt-4o-mini")]),
			prompt: "hi",
			maxRetries: 0,
		});

		expect(bindingData).toHaveLength(1);
		expect(bindingData[0]?.provider).toBe("openai");
		expect(bindingData[0]?.headers["cf-aig-skip-cache"]).toBe("true");
		expect(bindingData[0]?.headers["cf-aig-cache-ttl"]).toBe("60");
		expect(JSON.stringify(bindingData)).not.toContain(CF_TEMP_TOKEN);
	});
});
