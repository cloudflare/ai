import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { describe, expect, it } from "vitest";
import { createAIGateway } from "../../src";

/**
 * Integration tests for the AI Gateway REST API mode.
 *
 * These run directly from the test process (no worker needed).
 *
 * Required env vars:
 *   CLOUDFLARE_ACCOUNT_ID              — Your Cloudflare account ID
 *   OPENAI_API_KEY                      — OpenAI API key
 *   CLOUDFLARE_GATEWAY_NAME_UNAUTH      — Name of an unauthenticated AI Gateway
 *   CLOUDFLARE_GATEWAY_NAME_AUTH        — Name of an authenticated AI Gateway
 *   CLOUDFLARE_GATEWAY_AUTH_TOKEN       — cf-aig-authorization token for the authenticated gateway
 */

const {
	CLOUDFLARE_ACCOUNT_ID,
	OPENAI_API_KEY,
	CLOUDFLARE_GATEWAY_NAME_UNAUTH,
	CLOUDFLARE_GATEWAY_NAME_AUTH,
	CLOUDFLARE_GATEWAY_AUTH_TOKEN,
} = process.env;

const hasBasicCreds = !!(CLOUDFLARE_ACCOUNT_ID && OPENAI_API_KEY);
const hasUnauthGateway = !!(hasBasicCreds && CLOUDFLARE_GATEWAY_NAME_UNAUTH);
const hasAuthGateway = !!(
	hasBasicCreds &&
	CLOUDFLARE_GATEWAY_NAME_AUTH &&
	CLOUDFLARE_GATEWAY_AUTH_TOKEN
);

if (!hasBasicCreds) {
	console.warn(
		"\n⚠ Missing CLOUDFLARE_ACCOUNT_ID or OPENAI_API_KEY. Skipping REST API integration tests.\n",
	);
}

// ─── Unauthenticated gateway, user's own API key ────────────────

describe.skipIf(!hasUnauthGateway)("REST API: Unauthenticated gateway + own API key", () => {
	it("should generate text", async () => {
		const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: CLOUDFLARE_GATEWAY_NAME_UNAUTH!,
			provider: openai,
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Respond with exactly the word 'hello' and nothing else.",
		});

		expect(result.text).toBeTruthy();
		expect(typeof result.text).toBe("string");
		expect(result.usage).toBeDefined();
	});

	it("should stream text", async () => {
		const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: CLOUDFLARE_GATEWAY_NAME_UNAUTH!,
			provider: openai,
		});

		const result = streamText({
			model: gateway("gpt-4o-mini"),
			prompt: "Respond with exactly the word 'hello' and nothing else.",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBeTruthy();
	});

	it("should generate text with gateway options", async () => {
		const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: CLOUDFLARE_GATEWAY_NAME_UNAUTH!,
			provider: openai,
			options: {
				collectLog: true,
				metadata: { test: "rest-api-unauth" },
			},
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Respond with exactly the word 'hello' and nothing else.",
		});

		expect(result.text).toBeTruthy();
	});
});

// ─── Authenticated gateway, BYOK ────────────────────────────────
//     (BYOK requires an authenticated gateway with stored provider keys)

// ─── Authenticated gateway, user's own API key ──────────────────

describe.skipIf(!hasAuthGateway)("REST API: Authenticated gateway + own API key", () => {
	it("should generate text with gateway auth token", async () => {
		const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: CLOUDFLARE_GATEWAY_NAME_AUTH!,
			apiKey: CLOUDFLARE_GATEWAY_AUTH_TOKEN!,
			provider: openai,
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Respond with exactly the word 'hello' and nothing else.",
		});

		expect(result.text).toBeTruthy();
	});

	it("should stream text with gateway auth token", async () => {
		const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: CLOUDFLARE_GATEWAY_NAME_AUTH!,
			apiKey: CLOUDFLARE_GATEWAY_AUTH_TOKEN!,
			provider: openai,
		});

		const result = streamText({
			model: gateway("gpt-4o-mini"),
			prompt: "Respond with exactly the word 'hello' and nothing else.",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBeTruthy();
	});

	it("should throw AiGatewayUnauthorizedError without auth token", async () => {
		const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: CLOUDFLARE_GATEWAY_NAME_AUTH!,
			provider: openai,
		});

		await expect(
			generateText({
				model: gateway("gpt-4o-mini"),
				prompt: "Hello",
			}),
		).rejects.toThrow();
	});
});

describe.skipIf(!hasAuthGateway)("REST API: Authenticated gateway + BYOK", () => {
	it("should generate text with BYOK + gateway auth", async () => {
		const openai = createOpenAI({ apiKey: "unused" });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: CLOUDFLARE_GATEWAY_NAME_AUTH!,
			apiKey: CLOUDFLARE_GATEWAY_AUTH_TOKEN!,
			provider: openai,
			byok: true,
		});

		const result = await generateText({
			model: gateway("gpt-4o-mini"),
			prompt: "Respond with exactly the word 'hello' and nothing else.",
		});

		expect(result.text).toBeTruthy();
	});

	it("should stream text with BYOK + gateway auth", async () => {
		const openai = createOpenAI({ apiKey: "unused" });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: CLOUDFLARE_GATEWAY_NAME_AUTH!,
			apiKey: CLOUDFLARE_GATEWAY_AUTH_TOKEN!,
			provider: openai,
			byok: true,
		});

		const result = streamText({
			model: gateway("gpt-4o-mini"),
			prompt: "Respond with exactly the word 'hello' and nothing else.",
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBeTruthy();
	});
});

// ─── Error handling ──────────────────────────────────────────────

describe.skipIf(!hasBasicCreds)("REST API: Error handling", () => {
	it("should throw on invalid gateway name", async () => {
		const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
		const gateway = createAIGateway({
			accountId: CLOUDFLARE_ACCOUNT_ID!,
			gateway: "this-gateway-definitely-does-not-exist-abc123",
			provider: openai,
		});

		await expect(
			generateText({
				model: gateway("gpt-4o-mini"),
				prompt: "Hello",
			}),
		).rejects.toThrow();
	});
});
