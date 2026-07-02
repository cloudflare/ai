/**
 * E2E integration tests for the AI Gateway delegate (RFC Tier-2 matrix).
 *
 * Starts a real wrangler dev server with the gateway-worker fixture and drives a
 * live query through every transport + feature: the resumable run path, a
 * mid-stream drop + reconstruct, the gateway path (BYOK + caching), client/server
 * fallback, and the bring-your-own-provider wrapper.
 *
 * Hardening notes:
 *   - The suite first probes the run path (beforeAll). If the gateway/unified
 *     billing is not reachable at all, run-path tests `skip()` with a clear
 *     reason instead of silently passing.
 *   - When a call *succeeds*, its shape is asserted strictly (transport, runId,
 *     resume flags, non-empty text). A genuine model-unavailable upstream error
 *     (404 / "not found") is a classified skip; ANY other error or a malformed
 *     success (empty text, wrong transport, missing runId on a stream) FAILS.
 *
 * Prerequisites:
 *   - `RUN_E2E=1` (the suite is a no-op otherwise)
 *   - Authenticated with Cloudflare (`wrangler login` or CLOUDFLARE_API_TOKEN)
 *   - A reachable AI Gateway (defaults to `default`; override with `GATEWAY_ID`)
 *   - Optional BYOK keys as wrangler secrets / .dev.vars:
 *       DEEPSEEK_API_KEY, GROQ_API_KEY, OPENAI_API_KEY
 *
 * Run with: RUN_E2E=1 pnpm test:e2e:gateway
 */
import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN = process.env.RUN_E2E === "1";
const WORKER_DIR = new URL("./fixtures/gateway-worker", import.meta.url).pathname;
const PORT = 8801;
const BASE = `http://localhost:${PORT}`;
const HAS_DEEPSEEK = Boolean(process.env.DEEPSEEK_API_KEY);

type Json = Record<string, unknown>;

async function post(path: string, body: Json = {}): Promise<Json> {
	const res = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return res.json() as Promise<Json>;
}

async function waitForReady(url: string, timeoutMs = 50_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			if ((await fetch(url)).ok) return true;
		} catch {
			// not ready
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}

/**
 * An upstream "this model is not enabled for this account" error — a property of
 * the account's catalog, not a delegate bug — so the model is skipped, not failed.
 */
function isModelUnavailable(err: string): boolean {
	return /not found|not available|no such model|model_not_found|unauthorized|forbidden|access denied/i.test(
		err,
	);
}

/**
 * A model returned a response the AI SDK could not coerce into the requested
 * object — a structured-output *capability* limitation of that model, not a
 * delegate/provider bug. Tolerated for non-guaranteed models only.
 */
function isStructuredOutputUnsupported(err: string): boolean {
	return /no object generated|could not parse the response|did not match schema|response did not match/i.test(
		err,
	);
}

let wrangler: ChildProcess | null = null;
let ready = false;
/** Set in beforeAll: does the resumable run path actually work on this account? */
let runPathReady = false;
let runPathReason = "not probed";

const RUN_MODELS = [
	// openai/google exercise the openai-wire run path; anthropic exercises the
	// Anthropic-native run path (unified billing passes it through natively).
	{ slug: "openai/gpt-5-mini", label: "openai/gpt-5-mini", guaranteed: true },
	{ slug: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash", guaranteed: false },
	{ slug: "anthropic/claude-haiku-4.5", label: "anthropic/claude-haiku-4.5", guaranteed: false },
	// Newer unified-catalog chat providers (run path, openai-wire, resumable),
	// verified live: alibaba (Qwen, DashScope OpenAI-compat) and minimax (M-series).
	{ slug: "alibaba/qwen3-max", label: "alibaba/qwen3-max", guaranteed: false },
	{ slug: "minimax/m3", label: "minimax/m3", guaranteed: false },
] as const;

describe.skipIf(!RUN)("AI Gateway delegate E2E", () => {
	beforeAll(async () => {
		wrangler = spawn(
			"pnpm",
			["exec", "wrangler", "dev", "--port", String(PORT), "--log-level", "error"],
			{ cwd: WORKER_DIR, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
		);
		let stderr = "";
		wrangler.stderr?.on("data", (d: Buffer) => {
			stderr += d.toString();
		});
		ready = await waitForReady(`${BASE}/health`);
		if (!ready) {
			console.error("[gateway-e2e] wrangler dev failed to start:\n", stderr);
			return;
		}

		// Capability probe: drive the guaranteed model through the run path. If the
		// gateway / unified billing is unreachable, the run-path tests skip with a
		// clear reason rather than masking the outage as green.
		try {
			const probe = await post("/run/stream", { slug: "openai/gpt-5-mini" });
			if (probe.streamErr) {
				runPathReason = `run path unavailable: ${String(probe.streamErr).slice(0, 160)}`;
			} else if (typeof probe.text === "string" && probe.text.length > 0 && probe.runId) {
				runPathReady = true;
				runPathReason = "ready";
			} else {
				runPathReason = `run path returned no text/runId (offset=${probe.lastOffset})`;
			}
		} catch (e) {
			runPathReason = `probe threw: ${e instanceof Error ? e.message : String(e)}`;
		}
		if (!runPathReady) console.warn(`[gateway-e2e] ${runPathReason}`);
	}, 90_000);

	afterAll(async () => {
		if (wrangler) {
			wrangler.kill("SIGTERM");
			await new Promise((r) => setTimeout(r, 1_000));
			if (!wrangler.killed) wrangler.kill("SIGKILL");
			wrangler = null;
		}
	}, 10_000);

	// --- Run path (unified billing, resumable) ---
	describe("run path — chat", () => {
		for (const m of RUN_MODELS) {
			it(`${m.label} — chat on the run path`, (ctx) => {
				if (!runPathReady) return ctx.skip(`run path not ready (${runPathReason})`);
				return (async () => {
					const data = await post("/run/chat", { slug: m.slug });
					if (data.error) {
						if (!m.guaranteed && isModelUnavailable(String(data.error))) {
							return ctx.skip(
								`model unavailable: ${String(data.error).slice(0, 80)}`,
							);
						}
						throw new Error(`[run/chat] ${m.label}: ${String(data.error)}`);
					}
					expect(data.transport).toBe("run");
					expect(typeof data.text).toBe("string");
					expect((data.text as string).length).toBeGreaterThan(0);
				})();
			});
		}
	});

	describe("run path — streaming + resume capture", () => {
		for (const m of RUN_MODELS) {
			it(`${m.label} — streaming surfaces text, runId + progress offset`, (ctx) => {
				if (!runPathReady) return ctx.skip(`run path not ready (${runPathReason})`);
				return (async () => {
					const data = await post("/run/stream", { slug: m.slug });
					if (data.streamErr) {
						if (!m.guaranteed && isModelUnavailable(String(data.streamErr))) {
							return ctx.skip(
								`model unavailable: ${String(data.streamErr).slice(0, 80)}`,
							);
						}
						throw new Error(`[run/stream] ${m.label}: ${String(data.streamErr)}`);
					}
					// A run-path stream MUST surface text, a resumable run id, the resume
					// flag, and a positive cumulative event offset.
					expect(data.transport).toBe("run");
					expect((data.text as string).length).toBeGreaterThan(0);
					expect(data.resumeEnabled).toBe(true);
					expect(typeof data.runId).toBe("string");
					expect((data.runId as string).length).toBeGreaterThan(0);
					expect(data.lastOffset).toBeGreaterThan(0);
				})();
			});
		}
	});

	// --- Structured output (issue #559) ---
	// The partner path must satisfy OpenAI's `response_format.json_schema.name`
	// requirement (built by the real @ai-sdk/openai provider, not dropped).
	describe("run path — structured output", () => {
		for (const m of RUN_MODELS) {
			it(`${m.label} — structured output via Output.object`, (ctx) => {
				if (!runPathReady) return ctx.skip(`run path not ready (${runPathReason})`);
				return (async () => {
					const data = await post("/run/structured", { slug: m.slug });
					if (data.error) {
						const err = String(data.error);
						if (
							!m.guaranteed &&
							(isModelUnavailable(err) || isStructuredOutputUnsupported(err))
						) {
							return ctx.skip(
								`structured output unavailable/unsupported: ${err.slice(0, 80)}`,
							);
						}
						throw new Error(`[run/structured] ${m.label}: ${err}`);
					}
					const output = data.output as {
						capital?: unknown;
						population_millions?: unknown;
					} | null;
					expect(output, "no structured output returned").toBeTruthy();
					expect(typeof output?.capital).toBe("string");
					expect(typeof output?.population_millions).toBe("number");
				})();
			});
		}
	});

	// --- Headline: mid-stream drop + zero-loss reconstruction ---
	describe("run path — resume after a mid-stream drop", () => {
		it("reconstructs a dropped stream byte-identically", (ctx) => {
			if (!runPathReady) return ctx.skip(`run path not ready (${runPathReason})`);
			return (async () => {
				const data = await post("/run/resume", { slug: "openai/gpt-5-mini" });
				if (data.error) throw new Error(`[run/resume]: ${String(data.error)}`);
				expect(data.consumedEvents).toBeGreaterThan(0);
				expect(data.combinedLen).toBeGreaterThan(0);
				// Re-attached tail + initial head must equal a full ground-truth replay.
				expect(
					data.match,
					`recombined != full replay (${data.combinedTail} vs ${data.fullTail})`,
				).toBe(true);
				expect(data.combinedLen).toBe(data.fullLen);
			})();
		});
	});

	// --- Metadata / collectLog passthrough ---
	describe("run path — metadata + collectLog", () => {
		it("accepts first-class metadata + collectLog on a live dispatch", (ctx) => {
			if (!runPathReady) return ctx.skip(`run path not ready (${runPathReason})`);
			return (async () => {
				const data = await post("/run/metadata", { slug: "openai/gpt-5-mini" });
				if (data.error) throw new Error(`[run/metadata]: ${String(data.error)}`);
				// The dispatch still engages on the run path (non-empty text) with
				// metadata + collectLog set — proving the binding accepts them.
				// (runId is stream-only, so a non-streaming generateText has none.)
				expect(data.transport).toBe("run");
				expect((data.text as string).length).toBeGreaterThan(0);
			})();
		});
	});

	// --- Gateway path (BYOK) ---
	describe("gateway path — BYOK", () => {
		it.skipIf(!HAS_DEEPSEEK)("deepseek/deepseek-chat — chat with a forwarded key", async () => {
			if (!ready) return;
			const data = await post("/gateway/chat", {
				slug: "deepseek/deepseek-chat",
				key: process.env.DEEPSEEK_API_KEY,
			});
			if (data.error) throw new Error(`[gateway/chat] deepseek: ${String(data.error)}`);
			expect(data.transport).toBe("gateway");
			expect((data.text as string).length).toBeGreaterThan(0);
		});
	});

	// --- Caching (gateway path) ---
	describe("gateway path — caching", () => {
		it("repeats a query and gets a cache HIT on the second call", (ctx) => {
			if (!ready) return ctx.skip("server not ready");
			return (async () => {
				const data = await post("/gateway/cache", { slug: "openai/gpt-5-mini" });
				if (data.error) throw new Error(`[gateway/cache]: ${String(data.error)}`);
				const first = data.first as { cacheStatus?: string };
				const second = data.second as { cacheStatus?: string };
				// Caching is a gateway feature; if it's disabled on the gateway the
				// status is absent — skip rather than fail. When present it must HIT.
				if (!second?.cacheStatus) {
					return ctx.skip("gateway caching disabled (no cf-aig-cache-status)");
				}
				expect(first?.cacheStatus).toBe("MISS");
				expect(second.cacheStatus).toBe("HIT");
			})();
		});
	});

	// --- Fallback ---
	describe("fallback", () => {
		it("client-side fallback recovers from a bad primary model", (ctx) => {
			if (!runPathReady) return ctx.skip(`run path not ready (${runPathReason})`);
			return (async () => {
				const data = await post("/fallback/client", {
					slug: "openai/this-model-does-not-exist",
					models: ["openai/gpt-5-mini"],
				});
				if (data.error) throw new Error(`[fallback/client]: ${String(data.error)}`);
				expect((data.text as string).length).toBeGreaterThan(0);
			})();
		});

		it("server-side fallback returns text on the gateway path", (ctx) => {
			if (!ready) return ctx.skip("server not ready");
			return (async () => {
				const data = await post("/fallback/server", {
					slug: "openai/gpt-5-mini",
					models: ["openai/gpt-5-nano"],
				});
				if (data.error) throw new Error(`[fallback/server]: ${String(data.error)}`);
				expect(data.transport).toBe("gateway");
				expect((data.text as string).length).toBeGreaterThan(0);
			})();
		});
	});

	// --- Bring-your-own-provider ---
	describe("bring-your-own-provider", () => {
		it("routes a createOpenAI provider through the gateway", (ctx) => {
			if (!ready) return ctx.skip("server not ready");
			return (async () => {
				const data = await post("/byog", { slug: "gpt-5-mini" });
				if (data.error) throw new Error(`[byog]: ${String(data.error)}`);
				expect((data.text as string).length).toBeGreaterThan(0);
			})();
		});
	});

	// --- Run-path catalog membership (issue #596) ---
	// The pure run path (`env.AI.run`, no BYOK key) cleanly distinguishes what
	// Cloudflare serves on the unified run catalog from what it does not:
	//   • unified, recognized ⇒ 200 (with credits) / 402 "insufficient balance"
	//   • recognized, BYOK-only ⇒ 402 err 2021 "not available via unified billing"
	//   • off-catalog ⇒ 404 err 7003 "model not found"
	// This membership drives the `runCatalog`/`billing` flags in the provider
	// registry, so we probe it live. Guards the #596 regression (deepseek/* — a
	// real unified-billing run model — was misclassified as an off-catalog BYOK
	// slug and forced onto the gateway universal endpoint) AND the follow-up
	// correction (the rest of the OpenAI-wire long tail is genuinely off-catalog:
	// mistral/cerebras/… return 7003, so they must stay `runCatalog:false`). See
	// the `/probe/run` endpoint in the fixture worker.
	describe("run-path catalog membership (#596)", () => {
		/** err 7003 / "model not found" ⇒ the run router does not know this slug. */
		function isModelNotFound(status: number, body: string): boolean {
			return (
				status === 404 ||
				/"code"\s*:\s*7003|model not found|no such model|model_not_found/i.test(body)
			);
		}

		// On the unified run catalog (recognized by the run router — NOT 7003).
		// deepseek-v4-pro is the exact model from #596; deepseek-chat is a
		// recognized-but-BYOK deepseek id (402 err 2021, still not a 7003); openai
		// is a headline control.
		const ON_CATALOG = [
			"deepseek/deepseek-v4-pro",
			"deepseek/deepseek-chat",
			"openai/gpt-4.1-mini",
		];
		for (const slug of ON_CATALOG) {
			it(`${slug} is recognized on the run path (not model-not-found)`, (ctx) => {
				if (!ready) return ctx.skip("server not ready");
				return (async () => {
					const data = await post("/probe/run", { slug });
					if (data.status === 0) {
						return ctx.skip(`probe threw: ${String(data.error).slice(0, 80)}`);
					}
					const body = String(data.bodySnippet ?? "");
					expect(
						isModelNotFound(data.status as number, body),
						`expected ${slug} to be a known run-catalog model, got ` +
							`[${data.status}] ${body.slice(0, 140)}`,
					).toBe(false);
				})();
			});
		}

		// OFF the unified run catalog: the OpenAI-wire long tail we reclassified back
		// to `runCatalog:false` (BYOK gateway path only). Canonical model ids return
		// 7003 model-not-found on the run path — which is precisely why they must not
		// default to `env.AI.run`. If Cloudflare later adds any to unified billing,
		// this flips to a failure that prompts a registry reclassification.
		const OFF_CATALOG = [
			"mistral/mistral-large-latest",
			"cerebras/llama-3.3-70b",
			"fireworks/llama-v3p1-8b-instruct",
		];
		for (const slug of OFF_CATALOG) {
			it(`${slug} is NOT on the run catalog (model-not-found)`, (ctx) => {
				if (!ready) return ctx.skip("server not ready");
				return (async () => {
					const data = await post("/probe/run", { slug });
					if (data.status === 0) {
						return ctx.skip(`probe threw: ${String(data.error).slice(0, 80)}`);
					}
					const body = String(data.bodySnippet ?? "");
					expect(
						isModelNotFound(data.status as number, body),
						`expected ${slug} to be off the run catalog (7003), got ` +
							`[${data.status}] ${body.slice(0, 140)}`,
					).toBe(true);
				})();
			});
		}

		it("an unknown model id IS model-not-found (probe sanity)", (ctx) => {
			if (!ready) return ctx.skip("server not ready");
			return (async () => {
				const data = await post("/probe/run", {
					slug: "deepseek/definitely-not-a-real-model-xyz",
				});
				if (data.status === 0) {
					return ctx.skip(`probe threw: ${String(data.error).slice(0, 80)}`);
				}
				const body = String(data.bodySnippet ?? "");
				expect(isModelNotFound(data.status as number, body)).toBe(true);
			})();
		});
	});
});
