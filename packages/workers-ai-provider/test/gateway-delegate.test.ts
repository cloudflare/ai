import type { LanguageModelV4 } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import {
	createGatewayDelegate,
	GatewayDelegateError,
	parseSlug,
	type ProviderPlugin,
	selectTransport,
} from "../src/gateway-delegate";

// ---------------------------------------------------------------------------
// parseSlug
// ---------------------------------------------------------------------------

describe("parseSlug", () => {
	it("splits vendor/model", () => {
		expect(parseSlug("openai/gpt-5")).toEqual({ resolverKey: "openai", modelId: "gpt-5" });
	});

	it("keeps multi-segment model ids for routing providers", () => {
		expect(parseSlug("openrouter/anthropic/claude-sonnet-4-5")).toEqual({
			resolverKey: "openrouter",
			modelId: "anthropic/claude-sonnet-4-5",
		});
	});

	it("throws when there is no resolver key", () => {
		expect(() => parseSlug("gpt-5")).toThrow(/no resolver key/);
	});

	it("throws when a segment is empty", () => {
		expect(() => parseSlug("openai/")).toThrow(/malformed/);
		expect(() => parseSlug("/gpt-5")).toThrow(/malformed/);
	});
});

// ---------------------------------------------------------------------------
// selectTransport
// ---------------------------------------------------------------------------

describe("selectTransport", () => {
	it("defaults to the run path with resume on", () => {
		const s = selectTransport({}, false);
		expect(s.transport).toBe("run");
		expect(s.resumeEnabled).toBe(true);
		expect(s.warnings).toHaveLength(0);
	});

	it("honors resume:false on the run path", () => {
		const s = selectTransport({ resume: false }, false);
		expect(s.transport).toBe("run");
		expect(s.resumeEnabled).toBe(false);
	});

	it("moves server fallback to the gateway path and warns (resume defaulted)", () => {
		const s = selectTransport(
			{ fallback: { mode: "server", models: ["openai/gpt-5-mini"] } },
			false,
		);
		expect(s.transport).toBe("gateway");
		expect(s.resumeEnabled).toBe(false);
		expect(s.warnings.join(" ")).toMatch(/resume disabled/);
	});

	it("moves caching to the gateway path and warns", () => {
		expect(selectTransport({ cacheTtl: 3600 }, false).transport).toBe("gateway");
		expect(selectTransport({ skipCache: true }, false).warnings).not.toHaveLength(0);
	});

	it("client fallback stays on the run path with resume", () => {
		const s = selectTransport(
			{ fallback: { mode: "client", models: ["openai/gpt-5-mini"] } },
			false,
		);
		expect(s.transport).toBe("run");
		expect(s.resumeEnabled).toBe(true);
	});

	it("throws when resume:true conflicts with server fallback", () => {
		expect(() =>
			selectTransport({ fallback: { mode: "server", models: ["openai/gpt-5-mini"] } }, true),
		).toThrow(/resume:true conflicts/);
	});

	it("throws when resume:true conflicts with caching", () => {
		expect(() => selectTransport({ cacheTtl: 60 }, true)).toThrow(/resume:true conflicts/);
	});

	it('throws when transport:"run" cannot satisfy a gateway-only feature', () => {
		expect(() => selectTransport({ transport: "run", cacheTtl: 60 }, false)).toThrow(
			/transport:"run" cannot satisfy/,
		);
	});

	it('throws when transport:"gateway" is asked for resume', () => {
		expect(() => selectTransport({ transport: "gateway" }, true)).toThrow(
			/cannot provide resume/,
		);
	});

	it('honors the transport:"gateway" escape hatch without warnings', () => {
		const s = selectTransport({ transport: "gateway" }, false);
		expect(s.transport).toBe("gateway");
		expect(s.resumeEnabled).toBe(false);
		expect(s.warnings).toHaveLength(0);
	});

	// runCatalog = false (BYOK providers)
	it("forces the gateway path for non-run-catalog providers", () => {
		const s = selectTransport({}, false, false);
		expect(s.transport).toBe("gateway");
		expect(s.resumeEnabled).toBe(false);
	});

	it('throws when transport:"run" is requested for a non-run-catalog provider', () => {
		expect(() => selectTransport({ transport: "run" }, false, false)).toThrow(
			/transport:"run" is unavailable/,
		);
	});

	it("throws when resume:true is requested for a non-run-catalog provider", () => {
		expect(() => selectTransport({}, true, false)).toThrow(/resume:true is unavailable/);
	});

	// byok forwards the caller's own key — a gateway-path-only feature
	it("routes byok through the gateway path with resume disabled", () => {
		const s = selectTransport({ byok: true }, false);
		expect(s.transport).toBe("gateway");
		expect(s.resumeEnabled).toBe(false);
		expect(s.warnings).toHaveLength(0);
	});

	it('throws when byok is combined with transport:"run"', () => {
		expect(() => selectTransport({ byok: true, transport: "run" }, false)).toThrow(
			/cannot forward a BYOK key/,
		);
	});

	it("throws when byok is combined with resume:true", () => {
		expect(() => selectTransport({ byok: true }, true)).toThrow(/byok cannot provide resume/);
	});

	it("throws when byok targets a run-path-only provider (no gateway path)", () => {
		expect(() => selectTransport({ byok: true }, false, true, false)).toThrow(
			/byok is unavailable/,
		);
	});
});

// ---------------------------------------------------------------------------
// createGatewayDelegate — wiring (capture the injected fetch, no live AI SDK)
// ---------------------------------------------------------------------------

/** A plugin that records the fetch it was handed so we can drive it directly. */
function capturePlugin(wireFormat: "openai" | "anthropic" | "google"): {
	plugin: ProviderPlugin;
	getFetch: () => typeof globalThis.fetch;
} {
	let captured: typeof globalThis.fetch | undefined;
	return {
		plugin: {
			wireFormat,
			create: ({ modelId, fetch }) => {
				captured = fetch;
				return { specificationVersion: "v4", modelId } as unknown as LanguageModelV4;
			},
		},
		getFetch: () => {
			if (!captured) throw new Error("fetch not captured");
			return captured;
		},
	};
}

/**
 * A plugin whose model actually drives `fetch` (so the cross-vendor server-fallback
 * engine can capture each leg's native request) and parses the response by echoing
 * `modelId:body`. `url` is the provider-native endpoint the model posts to.
 */
function fallbackPlugin(
	wireFormat: "openai" | "anthropic" | "google",
	url: string,
): ProviderPlugin {
	return {
		wireFormat,
		create: ({ modelId, fetch }) => {
			const call = async () => {
				const resp = await fetch(url, {
					method: "POST",
					headers: {
						authorization: "Bearer sk-placeholder",
						"content-type": "application/json",
					},
					body: JSON.stringify({ model: modelId, messages: [] }),
				});
				return `${modelId}:${await resp.text()}`;
			};
			return {
				specificationVersion: "v4",
				provider: wireFormat,
				modelId,
				supportedUrls: {},
				doGenerate: async () => ({ content: [{ type: "text", text: await call() }] }),
				doStream: async () => ({ stream: new ReadableStream(), text: await call() }),
			} as unknown as LanguageModelV4;
		},
	};
}

interface GwCall {
	id: string;
	entries: Array<{
		provider: string;
		endpoint: string;
		headers: Record<string, string>;
		query: unknown;
	}>;
	options: Record<string, unknown>;
}

function makeBinding(): { binding: Ai; gwCalls: GwCall[]; runCalls: unknown[] } {
	const gwCalls: GwCall[] = [];
	const runCalls: unknown[] = [];
	const binding = {
		run: vi.fn(async (model: string, body: unknown, opts: unknown) => {
			runCalls.push({ model, body, opts });
			return new Response("ok", { headers: { "cf-aig-run-id": "run-123" } });
		}),
		gateway: vi.fn((id: string) => ({
			run: vi.fn(
				async (entries: GwCall["entries"], options: Record<string, unknown> = {}) => {
					gwCalls.push({ id, entries, options });
					return new Response("ok", { headers: { "cf-aig-log-id": "log-1" } });
				},
			),
		})),
	} as unknown as Ai;
	return { binding, gwCalls, runCalls };
}

const REQ = {
	method: "POST",
	headers: { authorization: "Bearer sk-placeholder", "content-type": "application/json" },
	body: JSON.stringify({ model: "gpt-5", messages: [] }),
};

describe("createGatewayDelegate", () => {
	it("throws without a binding", () => {
		expect(() =>
			createGatewayDelegate({ providers: [capturePlugin("openai").plugin] } as never),
		).toThrow(/requires a `binding`/);
	});

	it("throws without providers", () => {
		const { binding } = makeBinding();
		expect(() => createGatewayDelegate({ binding, providers: [] })).toThrow(
			/at least one provider plugin/,
		);
	});

	it("builds a model for a registered provider slug", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin],
		});
		expect(wai("openai/gpt-5").modelId).toBe("gpt-5");
	});

	it("throws for an unknown gateway provider", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin],
		});
		expect(() => wai("bogus/x")).toThrow(/Unknown gateway provider "bogus"/);
	});

	it("throws when the gateway-path wire-format plugin is missing", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin],
		});
		// On the GATEWAY path anthropic needs the anthropic wire-format plugin (the
		// request hits anthropic's native endpoint). Force the gateway path so this
		// isn't served by the run path's openai parser.
		expect(() => wai("anthropic/claude-sonnet-4-5", { transport: "gateway" })).toThrow(
			/No provider plugin for wire format "anthropic"/,
		);
	});

	it("parses google on the run path with the openai plugin (unified normalizes google to openai-wire)", () => {
		const { binding } = makeBinding();
		// Only the openai plugin is registered, yet a google slug builds on the run
		// path: the unified run path returns openai-wire for google.
		const wai = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin],
		});
		expect(wai("google/gemini-2.5-flash").modelId).toBe("gemini-2.5-flash");
	});

	it("parses anthropic on the run path with the anthropic plugin (unified keeps anthropic native)", () => {
		const { binding } = makeBinding();
		// Anthropic is passed through natively even on the run path, so it needs the
		// anthropic plugin — the openai plugin alone is not enough.
		const openaiOnly = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin],
		});
		expect(() => openaiOnly("anthropic/claude-sonnet-4-5")).toThrow(
			/needs the "anthropic" plugin/,
		);

		const withAnthropic = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin, capturePlugin("anthropic").plugin],
		});
		expect(withAnthropic("anthropic/claude-sonnet-4-5").modelId).toBe("claude-sonnet-4-5");
	});

	it("requires the run-path wire plugin even with a native gateway plugin present", () => {
		const { binding } = makeBinding();
		// Google plugin only — fine for the gateway path, but the run path returns
		// openai-wire for google and so needs the openai plugin.
		const wai = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("google").plugin],
		});
		expect(() => wai("google/gemini-2.5-flash")).toThrow(/needs the "openai" plugin/);
		// …but the gateway path is served by the google plugin.
		expect(wai("google/gemini-2.5-flash", { transport: "gateway" }).modelId).toBe(
			"gemini-2.5-flash",
		);
	});

	it("builds alibaba + minimax on the run path with the openai plugin", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin],
		});
		// Both are run-only unified-catalog providers, openai-wire on the run path,
		// so a single openai plugin is enough.
		expect(wai("alibaba/qwen3-max").modelId).toBe("qwen3-max");
		expect(wai("minimax/m3").modelId).toBe("m3");
	});

	it("rejects gateway-path use of a run-only provider with a clear error", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin],
		});
		// alibaba/minimax have no gateway path — caching, server fallback, and
		// transport:"gateway" must fail fast at build time, not upstream.
		expect(() => wai("alibaba/qwen3-max", { transport: "gateway" })).toThrow(/no gateway path/);
		expect(() => wai("alibaba/qwen3-max", { cacheTtl: 60 })).toThrow(/no gateway path/);
		expect(() =>
			wai("minimax/m3", { fallback: { mode: "server", models: ["minimax/m2.7"] } }),
		).toThrow(/no gateway path/);
	});

	it("routes the long tail through the openai wire-format plugin", () => {
		const { binding } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "default", providers: [plugin] });
		// deepseek is openai-wire ⇒ one openai plugin serves it
		expect(wai("deepseek/deepseek-chat").modelId).toBe("deepseek-chat");
		expect(getFetch).toBeTruthy();
	});

	it("requires a gateway (config or per-call)", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({ binding, providers: [capturePlugin("openai").plugin] });
		expect(() => wai("openai/gpt-5")).toThrow(/A gateway is required/);
	});

	it("surfaces transport-conflict errors at model build time", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({
			binding,
			gateway: "default",
			providers: [capturePlugin("openai").plugin],
		});
		expect(() =>
			wai("openai/gpt-5", {
				resume: true,
				fallback: { mode: "server", models: ["openai/gpt-5-mini"] },
			}),
		).toThrow(GatewayDelegateError);
	});

	// --- gateway-path entry shaping ---

	it("shapes a gateway entry: maps provider id, strips the endpoint host + auth header", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", { transport: "gateway" });
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);

		expect(gwCalls).toHaveLength(1);
		const [entry] = gwCalls[0].entries;
		expect(gwCalls[0].id).toBe("gw-1");
		expect(entry.provider).toBe("openai");
		expect(entry.endpoint).toBe("v1/chat/completions");
		expect(entry.headers.authorization).toBeUndefined();
		expect(entry.query).toEqual({ model: "gpt-5", messages: [] });
	});

	it("host-strips the long-tail endpoint via the registry transform (groq ⇒ chat/completions)", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		// force the gateway path for a run-catalog provider to exercise shaping
		wai("groq/llama-3.3-70b", { transport: "gateway" });
		// the builder targets groq's base (api.groq.com/openai/v1); the transform
		// strips that whole prefix → the gateway-native endpoint
		await getFetch()("https://api.groq.com/openai/v1/chat/completions", REQ);
		expect(gwCalls[0].entries[0].provider).toBe("groq");
		expect(gwCalls[0].entries[0].endpoint).toBe("chat/completions");
	});

	it("resolves slug aliases to the canonical run-catalog author (grok ⇒ xai)", async () => {
		const { binding, runCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("grok/grok-3"); // run path (xai is run-catalog)
		await getFetch()("https://api.x.ai/v1/chat/completions", REQ);
		expect((runCalls[0] as { model: string }).model).toBe("xai/grok-3");
	});

	it("rejects BYOG-only providers with a helpful error", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({
			binding,
			gateway: "gw-1",
			providers: [capturePlugin("openai").plugin],
		});
		expect(() => wai("cohere/command-r")).toThrow(/createGatewayProvider/);
	});

	it("maps the gateway provider id from the slug (google ⇒ google-ai-studio)", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("google");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("google/gemini-2.5-flash", { transport: "gateway" });
		await getFetch()("https://generativelanguage.googleapis.com/v1beta/models/x", REQ);
		expect(gwCalls[0].entries[0].provider).toBe("google-ai-studio");
	});

	it("forwards the auth header when byok is set", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		// `byok` forces the gateway path (forwarding the caller's key), even for a
		// run-catalog provider like deepseek that otherwise defaults to the run path.
		wai("deepseek/deepseek-chat", {
			byok: true,
			extraHeaders: { authorization: "Bearer real" },
		});
		await getFetch()("https://api.deepseek.com/v1/chat/completions", REQ);
		expect(gwCalls[0].entries[0].headers.authorization).toBe("Bearer real");
	});

	it("maps byok-alias/zdr (call) + event-id/timeout/retries/cache-key (gateway opts) to cf-aig-* headers", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({
			binding,
			gateway: {
				id: "gw-1",
				cacheKey: "ck-1",
				eventId: "evt-9",
				requestTimeoutMs: 9000,
				retries: { maxAttempts: 4, retryDelayMs: 200, backoff: "linear" },
			},
			providers: [plugin],
		});
		wai("openai/gpt-5", { transport: "gateway", byokAlias: "production", zdr: true });
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);

		const { headers } = gwCalls[0].entries[0];
		expect(headers["cf-aig-byok-alias"]).toBe("production");
		expect(headers["cf-aig-zdr"]).toBe("true");
		expect(headers["cf-aig-event-id"]).toBe("evt-9");
		expect(headers["cf-aig-request-timeout"]).toBe("9000");
		expect(headers["cf-aig-cache-key"]).toBe("ck-1");
		expect(headers["cf-aig-max-attempts"]).toBe("4");
		expect(headers["cf-aig-retry-delay"]).toBe("200");
		expect(headers["cf-aig-backoff"]).toBe("linear");
	});

	it("passes zdr through as a cf-aig-zdr extra header on the run path", async () => {
		const { binding, runCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", { zdr: false }); // run path (default)
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);
		const opts = (runCalls[0] as { opts: { extraHeaders?: Record<string, string> } }).opts;
		expect(opts.extraHeaders?.["cf-aig-zdr"]).toBe("false");
	});

	it("adds fallback entries for same-vendor server fallback", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", {
			transport: "gateway",
			fallback: { mode: "server", models: ["openai/gpt-5-mini"] },
		});
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);
		expect(gwCalls[0].entries).toHaveLength(2);
		expect((gwCalls[0].entries[1].query as { model: string }).model).toBe("gpt-5-mini");
	});

	it("dispatches cross-vendor server fallback as one run + parses the winning leg", async () => {
		// Each leg is a different vendor with a different wire format, so the
		// delegate must capture each one's native request, dispatch them as a single
		// gateway run, then feed the winner's raw response back into its own parser.
		const gwCalls: GwCall[] = [];
		const binding = {
			gateway: vi.fn((id: string) => ({
				run: vi.fn(
					async (entries: GwCall["entries"], options: Record<string, unknown> = {}) => {
						gwCalls.push({ id, entries, options });
						// cf-aig-step:"1" ⇒ the gateway served the second (anthropic) leg.
						return new Response("winner-body", { headers: { "cf-aig-step": "1" } });
					},
				),
			})),
		} as unknown as Ai;

		const wai = createGatewayDelegate({
			binding,
			gateway: "gw-1",
			providers: [
				fallbackPlugin("openai", "https://api.openai.com/v1/chat/completions"),
				fallbackPlugin("anthropic", "https://api.anthropic.com/v1/messages"),
			],
		});

		const model = wai("openai/gpt-5", {
			fallback: { mode: "server", models: ["anthropic/claude-sonnet-4-5"] },
		});
		const result = (await model.doGenerate({} as never)) as {
			content: Array<{ type: string; text: string }>;
		};

		// One run, two entries, the two distinct vendors in order.
		expect(gwCalls).toHaveLength(1);
		expect(gwCalls[0].entries).toHaveLength(2);
		expect(gwCalls[0].entries.map((e) => e.provider)).toEqual(["openai", "anthropic"]);
		expect((gwCalls[0].entries[0].query as { model: string }).model).toBe("gpt-5");
		expect((gwCalls[0].entries[1].query as { model: string }).model).toBe("claude-sonnet-4-5");
		// Provider auth headers are stripped (unified billing authenticates).
		expect(gwCalls[0].entries[0].headers.authorization).toBeUndefined();
		// The winner (step 1 = anthropic) parsed the raw run response.
		expect(result.content[0].text).toBe("claude-sonnet-4-5:winner-body");
	});

	it("threads an abort signal through a cross-vendor server fallback run", async () => {
		const seen: Record<string, unknown>[] = [];
		const binding = {
			gateway: vi.fn(() => ({
				run: vi.fn(async (_entries: unknown, options: Record<string, unknown> = {}) => {
					seen.push(options);
					return new Response("ok", { headers: { "cf-aig-step": "0" } });
				}),
			})),
		} as unknown as Ai;
		const wai = createGatewayDelegate({
			binding,
			gateway: "gw-1",
			providers: [
				fallbackPlugin("openai", "https://api.openai.com/v1/chat/completions"),
				fallbackPlugin("anthropic", "https://api.anthropic.com/v1/messages"),
			],
		});
		const model = wai("openai/gpt-5", {
			fallback: { mode: "server", models: ["anthropic/claude-sonnet-4-5"] },
		});
		const controller = new AbortController();
		await model.doGenerate({ abortSignal: controller.signal } as never);
		expect(seen[0].signal).toBe(controller.signal);
	});

	it("rejects a cross-vendor server-fallback leg with no native gateway path", () => {
		const { binding } = makeBinding();
		const wai = createGatewayDelegate({
			binding,
			gateway: "gw-1",
			providers: [fallbackPlugin("openai", "https://api.openai.com/v1/chat/completions")],
		});
		// alibaba is a run-only unified-catalog provider (no native gateway path),
		// so it cannot be a server-fallback leg.
		expect(() =>
			wai("openai/gpt-5", {
				fallback: { mode: "server", models: ["alibaba/qwen3-max"] },
			}),
		).toThrow(/no native gateway path/);
	});

	it("passes an abort signal through to the gateway run", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", { transport: "gateway" });
		const controller = new AbortController();
		await getFetch()("https://api.openai.com/v1/chat/completions", {
			...REQ,
			signal: controller.signal,
		});
		expect(gwCalls[0].options.signal).toBe(controller.signal);
	});

	it("writes cache-control headers on the gateway entry", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", { cacheTtl: 120, skipCache: true });
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);
		expect(gwCalls[0].entries[0].headers["cf-aig-cache-ttl"]).toBe("120");
		expect(gwCalls[0].entries[0].headers["cf-aig-skip-cache"]).toBe("true");
	});

	// --- metadata / collectLog passthrough ---

	it("forwards metadata + collectLog into the run-path gateway options", async () => {
		const { binding, runCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", { metadata: { tenant: "acme", seat: 7 }, collectLog: false });
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);
		const gw = (runCalls[0] as { opts: { gateway: GatewayOptions } }).opts.gateway;
		expect(gw.metadata).toEqual({ tenant: "acme", seat: 7 });
		expect(gw.collectLog).toBe(false);
		expect(gw.id).toBe("gw-1");
	});

	it("merges call-level metadata over gateway-option metadata on the run path (call wins)", async () => {
		const { binding, runCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", {
			gateway: { id: "gw-1", metadata: { tenant: "base", region: "iad" } },
			metadata: { tenant: "override" },
		});
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);
		const gw = (runCalls[0] as { opts: { gateway: GatewayOptions } }).opts.gateway;
		expect(gw.metadata).toEqual({ tenant: "override", region: "iad" });
	});

	it("writes cf-aig-metadata + cf-aig-collect-log headers on the gateway entry", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", {
			transport: "gateway",
			metadata: { tenant: "acme", seat: 7 },
			collectLog: true,
		});
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);
		const headers = gwCalls[0].entries[0].headers;
		expect(JSON.parse(headers["cf-aig-metadata"])).toEqual({ tenant: "acme", seat: 7 });
		expect(headers["cf-aig-collect-log"]).toBe("true");
	});

	it("serializes bigint metadata to a string for the gateway header", async () => {
		const { binding, gwCalls } = makeBinding();
		const { plugin, getFetch } = capturePlugin("openai");
		const wai = createGatewayDelegate({ binding, gateway: "gw-1", providers: [plugin] });
		wai("openai/gpt-5", { transport: "gateway", metadata: { big: 9007199254740993n } });
		await getFetch()("https://api.openai.com/v1/chat/completions", REQ);
		expect(JSON.parse(gwCalls[0].entries[0].headers["cf-aig-metadata"])).toEqual({
			big: "9007199254740993",
		});
	});
});
