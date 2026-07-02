/**
 * Test worker exercising the AI Gateway delegate (run path + gateway path),
 * client/server fallback, caching, resume capture, and the bring-your-own
 * provider wrapper. Started by wrangler dev during the gateway e2e suite.
 *
 * Each endpoint runs a real query through AI Gateway and returns the result as
 * JSON so the test harness can assert on it.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, jsonSchema, Output, streamText } from "ai";
import { anthropic } from "../../../../../src/anthropic";
import type { DispatchInfo } from "../../../../../src/gateway-delegate";
import { createGatewayDelegate } from "../../../../../src/gateway-delegate";
import { createGatewayFetch } from "../../../../../src/gateway-provider";
import { google } from "../../../../../src/google";
import { openai } from "../../../../../src/openai";
import { createResumableStream } from "../../../../../src/resumable-stream";

/** Extract assistant text from a chunk of OpenAI-wire SSE (`choices[].delta.content`). */
function sseText(sse: string): string {
	let out = "";
	for (const line of sse.split("\n")) {
		const t = line.trim();
		if (!t.startsWith("data:")) continue;
		const payload = t.slice(5).trim();
		if (!payload || payload === "[DONE]") continue;
		try {
			const j = JSON.parse(payload) as {
				choices?: Array<{ delta?: { content?: string } }>;
			};
			const c = j.choices?.[0]?.delta?.content;
			if (typeof c === "string") out += c;
		} catch {
			// non-JSON keepalive / comment line
		}
	}
	return out;
}

async function drainText(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const dec = new TextDecoder();
	let raw = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		raw += dec.decode(value, { stream: true });
	}
	raw += dec.decode();
	return sseText(raw);
}

interface Env {
	AI: Ai;
	GATEWAY_ID?: string;
	// BYOK keys (optional — only the providers you set keys for can be tested).
	OPENAI_API_KEY?: string;
	DEEPSEEK_API_KEY?: string;
	GROQ_API_KEY?: string;
}

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { "content-type": "application/json" },
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/health") return json({ ok: true });
		if (request.method !== "POST") return json({ error: "POST required" }, 405);

		const body = (await request.json().catch(() => ({}))) as {
			slug?: string;
			models?: string[];
			key?: string;
			prompt?: string;
		};
		const prompt = body.prompt ?? "Say hello in exactly one short sentence.";
		const gateway = env.GATEWAY_ID ?? "default";

		const wai = createGatewayDelegate({
			binding: env.AI,
			gateway,
			providers: [openai, anthropic, google],
		});

		try {
			switch (url.pathname) {
				// --- Run-path capability probe (issue #596) ---
				// Drives a slug through the PURE run path (`env.AI.run`, unified
				// billing, NO BYOK key, no delegate) to empirically determine which
				// `<provider>/<model>` slugs Cloudflare's unified catalog serves via
				// `/run`. Reports status + the `cf-aig-*` log headers (provider, path,
				// wholesale/unified-billing) so we can classify `runCatalog` from real
				// calls rather than a conservative guess.
				case "/probe/run": {
					const slug = body.slug ?? "openai/gpt-4.1-mini";
					const ai = env.AI as unknown as {
						run(m: string, i: unknown, o: unknown): Promise<Response>;
					};
					const started = Date.now();
					try {
						const resp = await ai.run(
							slug,
							{ messages: [{ role: "user", content: prompt }], max_tokens: 8 },
							{ gateway: { id: gateway }, returnRawResponse: true },
						);
						const text = await resp.text();
						const headers: Record<string, string> = {};
						for (const [k, v] of resp.headers) {
							if (k.startsWith("cf-aig")) headers[k] = v;
						}
						return json({
							slug,
							ok: resp.ok,
							status: resp.status,
							ms: Date.now() - started,
							headers,
							bodySnippet: text.slice(0, 400),
						});
					} catch (e) {
						return json({
							slug,
							ok: false,
							status: 0,
							ms: Date.now() - started,
							error: e instanceof Error ? e.message : String(e),
							name: (e as Error)?.name,
						});
					}
				}

				// --- Run path: unified-billing, resumable (cf-aig-run-id) ---
				case "/run/chat": {
					let dispatch: DispatchInfo | undefined;
					const result = await generateText({
						model: wai(body.slug ?? "openai/gpt-5-mini", {
							onDispatch: (info) => {
								dispatch = info;
							},
						}),
						prompt,
					});
					return json({
						text: result.text,
						transport: dispatch?.transport,
						runId: dispatch?.runId,
						resumeEnabled: dispatch?.resumeEnabled,
					});
				}

				case "/run/stream": {
					let dispatch: DispatchInfo | undefined;
					let lastOffset = -1;
					// streamText routes pre-stream + in-stream failures to onError and
					// to `error` parts rather than throwing, so capture them explicitly —
					// otherwise a failed stream looks like a silent empty response.
					let streamErr: string | undefined;
					const result = streamText({
						model: wai(body.slug ?? "openai/gpt-5-mini", {
							onDispatch: (info) => {
								dispatch = info;
							},
							onProgress: (offset) => {
								lastOffset = offset;
							},
						}),
						prompt,
						onError: ({ error }) => {
							streamErr ??= error instanceof Error ? error.message : String(error);
						},
					});
					let text = "";
					for await (const part of result.fullStream) {
						if (part.type === "text-delta") text += part.text;
						else if (part.type === "error" && !streamErr) {
							const e = part.error;
							streamErr = e instanceof Error ? e.message : String(e);
						}
					}
					return json({
						text,
						transport: dispatch?.transport,
						runId: dispatch?.runId,
						resumeEnabled: dispatch?.resumeEnabled,
						lastOffset,
						streamErr,
					});
				}

				// --- Run path: structured output (issue #559) ---
				// Drives a partner model (openai-wire) through the delegate with
				// `Output.object({ schema, name, description })`. The real @ai-sdk/openai
				// provider must build the `response_format.json_schema.name` envelope
				// OpenAI requires — the failure mode reported in #559.
				case "/run/structured": {
					let dispatch: DispatchInfo | undefined;
					const result = await generateText({
						model: wai(body.slug ?? "openai/gpt-5-mini", {
							onDispatch: (info) => {
								dispatch = info;
							},
						}),
						prompt: "What is the capital of France and its approximate population in millions?",
						output: Output.object({
							schema: jsonSchema<{
								capital: string;
								population_millions: number;
							}>({
								type: "object",
								properties: {
									capital: { type: "string" },
									population_millions: { type: "number" },
								},
								required: ["capital", "population_millions"],
								additionalProperties: false,
							}),
							name: "CountryCapital",
							description: "A country's capital city and its population.",
						}),
					});
					return json({
						output: result.output,
						transport: dispatch?.transport,
					});
				}

				// --- Resume: drop a live stream mid-flight and reconstruct it ---
				// Proves zero-loss recovery: consume a few SSE events, simulate a
				// disconnect, re-attach from the reached offset via the gateway resume
				// endpoint, and assert the recombined text is byte-identical to a full
				// ground-truth replay (resume?from=0).
				case "/run/resume": {
					const slug = body.slug ?? "openai/gpt-5-mini";
					const ai = env.AI as unknown as {
						run(m: string, i: unknown, o: unknown): Promise<Response>;
					};
					const resp = await ai.run(
						slug,
						{
							messages: [
								{
									role: "user",
									content:
										"Count from 1 to 40, one number per line, no other text.",
								},
							],
							stream: true,
						},
						{ gateway: { id: gateway }, returnRawResponse: true },
					);
					const runId = resp.headers.get("cf-aig-run-id");
					if (!resp.ok || !runId || !resp.body) {
						return json({
							error: `run failed (status=${resp.status}, runId=${runId})`,
							name: "ResumeSetupError",
						});
					}

					// Consume the first few complete SSE events, then "drop".
					const reader = resp.body.getReader();
					const dec = new TextDecoder();
					let buf = "";
					let firstRaw = "";
					let consumedEvents = 0;
					const STOP_AFTER = 3;
					drop: for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						buf += dec.decode(value, { stream: true });
						let idx: number;
						while ((idx = buf.indexOf("\n\n")) !== -1) {
							const evt = buf.slice(0, idx + 2);
							buf = buf.slice(idx + 2);
							firstRaw += evt;
							consumedEvents++;
							if (consumedEvents >= STOP_AFTER) break drop;
						}
					}
					// Simulate the originating disconnect.
					await reader.cancel().catch(() => {});

					// New "invocation": re-attach from the reached offset and finish.
					const reattachText = await drainText(
						createResumableStream({
							binding: env.AI,
							gateway,
							runId,
							fromEvent: consumedEvents,
						}),
					);
					// Ground truth: a full replay from event 0.
					const fullText = await drainText(
						createResumableStream({ binding: env.AI, gateway, runId, fromEvent: 0 }),
					);

					const combined = sseText(firstRaw) + reattachText;
					return json({
						runId,
						consumedEvents,
						combinedLen: combined.length,
						fullLen: fullText.length,
						match: combined === fullText,
						combinedTail: combined.slice(-48),
						fullTail: fullText.slice(-48),
					});
				}

				// --- Metadata / collectLog passthrough (run path) ---
				// Proves the real binding accepts first-class metadata + collectLog on
				// a live dispatch (exact wire is unit-tested). Returns runId so the test
				// can confirm the resumable run path still engages with them set.
				case "/run/metadata": {
					let dispatch: DispatchInfo | undefined;
					const result = await generateText({
						model: wai(body.slug ?? "openai/gpt-5-mini", {
							metadata: { tenant: "e2e", run: 1 },
							collectLog: true,
							onDispatch: (info) => {
								dispatch = info;
							},
						}),
						prompt,
					});
					return json({
						text: result.text,
						transport: dispatch?.transport,
						runId: dispatch?.runId,
					});
				}

				// --- Gateway path: BYOK, caching ---
				case "/gateway/chat": {
					const slug = body.slug ?? "deepseek/deepseek-chat";
					let dispatch: DispatchInfo | undefined;
					const result = await generateText({
						model: wai(slug, {
							transport: "gateway",
							byok: Boolean(body.key),
							...(body.key
								? { extraHeaders: { authorization: `Bearer ${body.key}` } }
								: {}),
							onDispatch: (info) => {
								dispatch = info;
							},
						}),
						prompt,
					});
					return json({
						text: result.text,
						transport: dispatch?.transport,
						cacheStatus: dispatch?.cacheStatus,
						logId: dispatch?.logId,
					});
				}

				case "/gateway/cache": {
					const slug = body.slug ?? "openai/gpt-5-mini";
					// Unique per request so the first call is always a fresh MISS,
					// independent of any prior run still inside the cache TTL window.
					const nonce = crypto.randomUUID();
					const run = async () => {
						let dispatch: DispatchInfo | undefined;
						const result = await generateText({
							model: wai(slug, {
								cacheTtl: 120,
								onDispatch: (info) => {
									dispatch = info;
								},
							}),
							prompt: `What is 2 + 2? Answer with just the number. (ref ${nonce})`,
						});
						return { text: result.text, cacheStatus: dispatch?.cacheStatus };
					};
					const first = await run();
					const second = await run();
					return json({ first, second });
				}

				// --- Fallback ---
				case "/fallback/client": {
					const result = await generateText({
						model: wai(body.slug ?? "openai/does-not-exist", {
							fallback: {
								mode: "client",
								models: body.models ?? ["openai/gpt-5-mini"],
							},
						}),
						prompt,
					});
					return json({ text: result.text });
				}

				case "/fallback/server": {
					let dispatch: DispatchInfo | undefined;
					const result = await generateText({
						model: wai(body.slug ?? "openai/gpt-5-mini", {
							fallback: {
								mode: "server",
								models: body.models ?? ["openai/gpt-5-nano"],
							},
							onDispatch: (info) => {
								dispatch = info;
							},
						}),
						prompt,
					});
					return json({ text: result.text, transport: dispatch?.transport });
				}

				// --- Bring-your-own-provider (gateway path) ---
				case "/byog": {
					const provider = createOpenAI({
						apiKey: env.OPENAI_API_KEY ?? "unused",
						fetch: createGatewayFetch({
							binding: env.AI,
							gateway,
							byok: Boolean(env.OPENAI_API_KEY),
						}),
					});
					const result = await generateText({
						model: provider.chat(body.slug ?? "gpt-5-mini"),
						prompt,
					});
					return json({ text: result.text });
				}

				default:
					return json({ error: `unknown endpoint ${url.pathname}` }, 404);
			}
		} catch (e) {
			return json(
				{ error: e instanceof Error ? e.message : String(e), name: (e as Error)?.name },
				200,
			);
		}
	},
};
