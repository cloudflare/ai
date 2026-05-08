import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAiGateway } from "../src";
import { createProviderRouter } from "../src/providers/router";

const TEST_ACCOUNT_ID = "test-account-id";
const TEST_API_KEY = "test-api-key";
const TEST_GATEWAY = "my-gateway";

let capturedBody: any = null;

const gatewayHandler = http.post(
	`https://gateway.ai.cloudflare.com/v1/${TEST_ACCOUNT_ID}/${TEST_GATEWAY}`,
	async ({ request }) => {
		capturedBody = await request.json();

		return HttpResponse.json(
			{
				id: "msg_test123",
				type: "message",
				role: "assistant",
				model: "claude-sonnet-4-5-20250514",
				content: [{ type: "text", text: "Hello" }],
				stop_reason: "end_turn",
				stop_sequence: null,
				usage: { input_tokens: 25, output_tokens: 1 },
			},
			{
				headers: {
					"cf-aig-step": "0",
				},
			},
		);
	},
);

const server = setupServer(gatewayHandler);

describe("Provider Router Integration", () => {
	beforeAll(() => server.listen());
	afterEach(() => {
		server.resetHandlers();
		capturedBody = null;
	});
	afterAll(() => server.close());

	it("preserves cache_control on user messages through router → native Anthropic → gateway", async () => {
		const anthropic = createAnthropic({ apiKey: TEST_API_KEY });
		const router = createProviderRouter({
			providers: {
				anthropic: (modelId) => anthropic.languageModel(modelId),
			},
		});

		const gateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});

		await generateText({
			model: gateway(router("anthropic/claude-sonnet-4-5-20250514")),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "What is 2+2?",
							providerOptions: {
								anthropic: { cacheControl: { type: "ephemeral" } },
							},
						},
					],
				},
			],
		});

		expect(capturedBody).toBeDefined();
		expect(capturedBody).toHaveLength(1);

		const query = capturedBody[0].query;
		expect(query.model).toBe("claude-sonnet-4-5-20250514");
		expect(query.messages[0].role).toBe("user");
		expect(query.messages[0].content[0].cache_control).toEqual({
			type: "ephemeral",
		});
	});

	it("preserves cache_control on system messages through router → native Anthropic → gateway", async () => {
		const anthropic = createAnthropic({ apiKey: TEST_API_KEY });
		const router = createProviderRouter({
			providers: {
				anthropic: (modelId) => anthropic.languageModel(modelId),
			},
		});

		const gateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});

		await generateText({
			model: gateway(router("anthropic/claude-sonnet-4-5-20250514")),
			messages: [
				{
					role: "system",
					content: "You are a helpful assistant",
					providerOptions: {
						anthropic: { cacheControl: { type: "ephemeral" } },
					},
				},
				{
					role: "user",
					content: "Hello",
				},
			],
		});

		expect(capturedBody).toBeDefined();
		expect(capturedBody).toHaveLength(1);

		const query = capturedBody[0].query;
		expect(query.system).toBeDefined();
		const systemBlocks = Array.isArray(query.system) ? query.system : [query.system];
		const lastBlock = systemBlocks[systemBlocks.length - 1];
		expect(lastBlock.cache_control).toEqual({ type: "ephemeral" });
	});

	it("routes through native Anthropic SDK (not unified) based on model prefix", async () => {
		const anthropic = createAnthropic({ apiKey: TEST_API_KEY });
		const router = createProviderRouter({
			providers: {
				anthropic: (modelId) => anthropic.languageModel(modelId),
			},
		});

		const gateway = createAiGateway({
			accountId: TEST_ACCOUNT_ID,
			apiKey: TEST_API_KEY,
			gateway: TEST_GATEWAY,
		});

		await generateText({
			model: gateway(router("anthropic/claude-sonnet-4-5-20250514")),
			prompt: "Hello",
		});

		expect(capturedBody).toBeDefined();
		expect(capturedBody).toHaveLength(1);

		expect(capturedBody[0].provider).toBe("anthropic");
		expect(capturedBody[0].endpoint).toBe("v1/messages");
		expect(capturedBody[0].query.model).toBe("claude-sonnet-4-5-20250514");
	});
});
