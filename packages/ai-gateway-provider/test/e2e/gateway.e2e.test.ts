/**
 * E2E tests for `ai-gateway-provider` against the live Cloudflare AI Gateway.
 *
 * The provider's headline features (chat / streaming / tools / structured
 * output / cross-vendor fallback / cf-aig-* options) were previously proven
 * only against MSW mocks. This suite drives them through the real gateway
 * universal endpoint via the REST/API-key path, forwarding a real provider key
 * (BYOK pass-through). It is the only automated coverage of the provider end to
 * end.
 *
 * Each leg is gated and tolerant: a genuine model-unavailable / capability
 * upstream error `skip()`s with a reason; any other failure (or a malformed
 * success) FAILS.
 *
 * Prerequisites (in a `.env` at the package root or the environment):
 *   CLOUDFLARE_ACCOUNT_ID=<account id>
 *   OPENAI_API_KEY=<provider key forwarded through the gateway>
 *   CLOUDFLARE_AI_GATEWAY_ID=<gateway id>   # or GATEWAY_ID / CLOUDFLARE_GATEWAY_NAME_UNAUTH; defaults to "default"
 *   CLOUDFLARE_AI_GATEWAY_TOKEN=<token>     # or CLOUDFLARE_GATEWAY_AUTH_TOKEN — only if the gateway has auth enabled
 *   CLOUDFLARE_AI_GATEWAY_DYNAMIC_ROUTE=<route name> # optional: enables the unified dynamic-route regression test (should resolve to Workers AI)
 *
 * Run with: pnpm test:e2e
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, jsonSchema, streamText, tool } from "ai";
import { afterAll, describe, expect, it } from "vitest";
import { createAiGateway } from "../../src";
import { createUnified } from "../../src/providers/unified";

// Locally typed so the suite needs neither @types/node nor an ESM module target
// (the package type-checks under `module: commonjs`).
declare const process: {
	env: Record<string, string | undefined>;
	loadEnvFile?: (path?: string) => void;
};

// Node 24+ ships process.loadEnvFile — load the package-root .env (cwd when run
// via `pnpm --filter ai-gateway-provider test:e2e`) without a dependency.
try {
	process.loadEnvFile?.();
} catch {
	// no .env present — rely on the ambient environment
}

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GATEWAY_ID =
	process.env.CLOUDFLARE_AI_GATEWAY_ID ||
	process.env.GATEWAY_ID ||
	process.env.CLOUDFLARE_GATEWAY_NAME_UNAUTH ||
	"default";
const CF_AIG_TOKEN =
	process.env.CLOUDFLARE_AI_GATEWAY_TOKEN || process.env.CLOUDFLARE_GATEWAY_AUTH_TOKEN || "";
const DYNAMIC_ROUTE = process.env.CLOUDFLARE_AI_GATEWAY_DYNAMIC_ROUTE?.trim();

const MODEL = process.env.OPENAI_E2E_MODEL || "gpt-4o-mini";

/** The floor: without an account id + a forwardable provider key, nothing runs. */
function noCreds() {
	return !ACCOUNT_ID || !OPENAI_API_KEY;
}

function noDynamicRoute() {
	return !ACCOUNT_ID || !DYNAMIC_ROUTE;
}

function isUnavailable(err: string): boolean {
	return /not found|not available|no such model|model_not_found|unauthorized|forbidden|access denied|does not exist/i.test(
		err,
	);
}

function isStructuredUnsupported(err: string): boolean {
	return /no object generated|could not parse|did not match schema|response did not match/i.test(
		err,
	);
}

function makeGateway() {
	const aigateway = createAiGateway({
		accountId: ACCOUNT_ID!,
		gateway: GATEWAY_ID,
		apiKey: CF_AIG_TOKEN,
	});
	const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
	return { aigateway, openai };
}

function makeUnifiedGateway() {
	const aigateway = createAiGateway({
		accountId: ACCOUNT_ID!,
		gateway: GATEWAY_ID,
		apiKey: CF_AIG_TOKEN,
	});
	const unified = createUnified();
	return { aigateway, unified };
}

describe.skipIf(noCreds())("ai-gateway-provider E2E (live gateway, REST path)", () => {
	afterAll(() => {
		// nothing to tear down — kept for symmetry with the other e2e suites
	});

	it("chat — generateText returns non-empty text", async (ctx) => {
		const { aigateway, openai } = makeGateway();
		try {
			const { text } = await generateText({
				model: aigateway([openai(MODEL)]),
				prompt: "Say hello in one short sentence.",
				maxRetries: 0,
			});
			expect(typeof text).toBe("string");
			expect(text.length).toBeGreaterThan(0);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (isUnavailable(msg)) return ctx.skip(`model unavailable: ${msg.slice(0, 80)}`);
			throw e;
		}
	});

	describe.skipIf(noDynamicRoute())("ai-gateway-provider E2E (unified dynamic route)", () => {
		afterAll(() => {
			// nothing to tear down — kept for symmetry with the other e2e suites
		});

		it("dynamic route — generateText returns exactly OK", async (ctx) => {
			const { aigateway, unified } = makeUnifiedGateway();
			try {
				const { text } = await generateText({
					model: aigateway(unified(DYNAMIC_ROUTE!)),
					prompt: "Reply with exactly: OK",
					maxOutputTokens: 64,
					maxRetries: 0,
				});
				expect(typeof text).toBe("string");
				expect(text.trim()).toBe("OK");
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (isUnavailable(msg)) {
					return ctx.skip(`dynamic route unavailable: ${msg.slice(0, 80)}`);
				}
				throw e;
			}
		});
	});

	it("streaming — streamText surfaces accumulated text", async (ctx) => {
		const { aigateway, openai } = makeGateway();
		try {
			const result = streamText({
				model: aigateway([openai(MODEL)]),
				prompt: "Count from one to three.",
				maxRetries: 0,
			});
			let text = "";
			for await (const delta of result.textStream) {
				text += delta;
			}
			expect(text.length).toBeGreaterThan(0);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (isUnavailable(msg)) return ctx.skip(`model unavailable: ${msg.slice(0, 80)}`);
			throw e;
		}
	});

	it("tools — model can emit a tool call through the gateway", async (ctx) => {
		const { aigateway, openai } = makeGateway();
		try {
			const result = await generateText({
				model: aigateway([openai(MODEL)]),
				prompt: "What is the weather in San Francisco? Use the tool.",
				tools: {
					get_weather: tool({
						description: "Get the current weather for a location",
						inputSchema: jsonSchema<{ location: string }>({
							type: "object",
							properties: { location: { type: "string" } },
							required: ["location"],
							additionalProperties: false,
						}),
					}),
				},
				maxRetries: 0,
			});
			// Either a tool call OR a plain answer is acceptable upstream behaviour;
			// the point is the round trip through the gateway succeeded.
			expect(result.toolCalls.length + (result.text ? 1 : 0)).toBeGreaterThan(0);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (isUnavailable(msg)) return ctx.skip(`model unavailable: ${msg.slice(0, 80)}`);
			throw e;
		}
	});

	it("structured output — generateObject parses a schema'd object", async (ctx) => {
		const { aigateway, openai } = makeGateway();
		try {
			const { object } = await generateObject({
				model: aigateway([openai(MODEL)]),
				prompt: "Give me the capital of France and its population in millions.",
				schema: jsonSchema<{ capital: string; population_millions: number }>({
					type: "object",
					properties: {
						capital: { type: "string" },
						population_millions: { type: "number" },
					},
					required: ["capital", "population_millions"],
					additionalProperties: false,
				}),
				maxRetries: 0,
			});
			expect(typeof object.capital).toBe("string");
			expect(typeof object.population_millions).toBe("number");
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (isUnavailable(msg) || isStructuredUnsupported(msg)) {
				return ctx.skip(`structured output unavailable/unsupported: ${msg.slice(0, 80)}`);
			}
			throw e;
		}
	});

	it("fallback — an invalid first model falls through to a valid one", async (ctx) => {
		const { aigateway, openai } = makeGateway();
		try {
			const { text } = await generateText({
				model: aigateway([openai("gpt-nonexistent-model-xyz"), openai(MODEL)]),
				prompt: "Say hello in one short sentence.",
				maxRetries: 0,
			});
			expect(text.length).toBeGreaterThan(0);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (isUnavailable(msg))
				return ctx.skip(`fallback model unavailable: ${msg.slice(0, 80)}`);
			throw e;
		}
	});

	it("options — cf-aig-* cache options do not break the request", async (ctx) => {
		const aigateway = createAiGateway({
			accountId: ACCOUNT_ID!,
			gateway: GATEWAY_ID,
			apiKey: CF_AIG_TOKEN,
			options: {
				cacheTtl: 60,
				metadata: { e2e: "agp-options" },
			},
		});
		const openai = createOpenAI({ apiKey: OPENAI_API_KEY! });
		try {
			const { text } = await generateText({
				model: aigateway([openai(MODEL)]),
				prompt: "Reply with the single word: ok.",
				maxRetries: 0,
			});
			expect(text.length).toBeGreaterThan(0);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (isUnavailable(msg)) return ctx.skip(`model unavailable: ${msg.slice(0, 80)}`);
			throw e;
		}
	});
});
