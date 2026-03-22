/**
 * E2E integration tests for Workers AI via the env.AI binding.
 *
 * These tests start a real wrangler dev server with a test worker that exercises
 * our provider through the Workers AI binding path. This validates:
 *   - Message normalization (null content, tool_call_id sanitization)
 *   - Stream format detection (native vs OpenAI format)
 *   - Tool call round-trips through the binding
 *
 * Prerequisites:
 *   - Authenticated with Cloudflare (`wrangler login` or CLOUDFLARE_API_TOKEN env var)
 *   - wrangler must be installed and accessible
 *
 * Run with: pnpm test:e2e:binding
 */
import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKER_DIR = new URL("./fixtures/binding-worker", import.meta.url).pathname;
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;

const MODELS = [
	// Recommended models
	{ id: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
	{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B" },
	{ id: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B" },
	{ id: "@cf/qwen/qwq-32b", label: "QwQ 32B (reasoning)" },
	// Other popular models
	{ id: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast" },
	{ id: "@cf/openai/gpt-oss-20b", label: "GPT-OSS 20B" },
	{ id: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B" },
	{ id: "@cf/moonshotai/kimi-k2.5", label: "Kimi K2.5" },
] as const;

// ---------------------------------------------------------------------------
// Results tracker
// ---------------------------------------------------------------------------

type Status = "ok" | "warn" | "fail";

const results: Record<
	string,
	{
		chat: Status;
		stream: Status;
		multiTurn: Status;
		toolCall: Status;
		toolRoundTrip: Status;
		toolMultiStep: Status;
		toolRequired: Status;
		structuredOutput: Status;
		notes: string[];
	}
> = {};

function getResult(label: string) {
	if (!results[label]) {
		results[label] = {
			chat: "fail",
			stream: "fail",
			multiTurn: "fail",
			toolCall: "fail",
			toolRoundTrip: "fail",
			toolMultiStep: "fail",
			toolRequired: "fail",
			structuredOutput: "fail",
			notes: [],
		};
	}
	return results[label];
}

function statusIcon(s: Status): string {
	if (s === "ok") return "  OK";
	if (s === "warn") return "  ~ ";
	return "  X ";
}

function printSummaryTable() {
	const labels = Object.keys(results);
	if (labels.length === 0) return;

	const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
	const maxLabel = Math.max(...labels.map((l) => l.length), 5);

	const header = `${pad("Model", maxLabel)} | Chat | Strm | Turn | Tool | T-RT | T-MS | T-Rq | JSON | Notes`;
	const sep = "-".repeat(header.length + 10);

	console.log(`\n${sep}`);
	console.log("  WORKERS AI BINDING — E2E RESULTS");
	console.log(sep);
	console.log(header);
	console.log(sep);

	for (const label of labels) {
		const r = results[label];
		const notes = r.notes.length > 0 ? r.notes.join("; ") : "";
		console.log(
			`${pad(label, maxLabel)} | ${statusIcon(r.chat)} | ${statusIcon(r.stream)} | ${statusIcon(r.multiTurn)} | ${statusIcon(r.toolCall)} | ${statusIcon(r.toolRoundTrip)} | ${statusIcon(r.toolMultiStep)} | ${statusIcon(r.toolRequired)} | ${statusIcon(r.structuredOutput)} | ${notes}`,
		);
	}

	console.log(sep);
	console.log("  OK = works    ~ = partial/quirky    X = broken/error");
	console.log("  T-MS = multi-step agentic loop    T-Rq = toolChoice required");
	console.log(`${sep}\n`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(path: string, body: Record<string, unknown> = {}) {
	const res = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return res.json() as Promise<Record<string, unknown>>;
}

async function waitForReady(url: string, timeoutMs = 45_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok) return true;
		} catch {
			// Server not ready yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}

// ---------------------------------------------------------------------------
// Wrangler dev lifecycle
// ---------------------------------------------------------------------------

let wranglerProcess: ChildProcess | null = null;
let serverReady = false;

describe("Workers AI Binding E2E", () => {
	beforeAll(async () => {
		wranglerProcess = spawn(
			"pnpm",
			["exec", "wrangler", "dev", "--port", String(PORT), "--log-level", "error"],
			{
				cwd: WORKER_DIR,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			},
		);

		let stderr = "";
		wranglerProcess.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		wranglerProcess.on("error", (err) => {
			console.error("[binding-e2e] Failed to start wrangler:", err.message);
		});

		serverReady = await waitForReady(`${BASE}/health`, 50_000);
		if (!serverReady) {
			console.error("[binding-e2e] wrangler dev failed to start within 50s");
			if (stderr) console.error("[binding-e2e] stderr:", stderr);
		}
	}, 60_000);

	afterAll(async () => {
		printSummaryTable();
		if (wranglerProcess) {
			wranglerProcess.kill("SIGTERM");
			await new Promise((r) => setTimeout(r, 1_000));
			if (!wranglerProcess.killed) {
				wranglerProcess.kill("SIGKILL");
			}
			wranglerProcess = null;
		}
	}, 10_000);

	// ------------------------------------------------------------------
	// Basic chat (per model)
	// ------------------------------------------------------------------
	describe("chat (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — basic chat via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat", { model: model.id });

				if (data.error) {
					r.chat = "fail";
					r.notes.push(`chat: ${String(data.error).slice(0, 60)}`);
					return;
				}

				if (typeof data.text === "string" && (data.text as string).length > 0) {
					r.chat = "ok";
				} else {
					r.chat = "warn";
					r.notes.push("chat: empty response");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Streaming chat (per model)
	// ------------------------------------------------------------------
	describe("streaming (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — streaming via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/stream", { model: model.id });

				if (data.error) {
					r.stream = "fail";
					r.notes.push(`stream: ${String(data.error).slice(0, 60)}`);
					return;
				}

				if (typeof data.text === "string" && (data.text as string).length > 0) {
					r.stream = "ok";
				} else {
					r.stream = "warn";
					r.notes.push("stream: empty response");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Multi-turn (per model)
	// ------------------------------------------------------------------
	describe("multi-turn (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — multi-turn via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/multi-turn", { model: model.id });

				if (data.error) {
					r.multiTurn = "fail";
					r.notes.push(`turn: ${String(data.error).slice(0, 60)}`);
					return;
				}

				const text = (data.text as string) || "";
				if (text.toLowerCase().includes("alice")) {
					r.multiTurn = "ok";
				} else if (text.length > 0) {
					r.multiTurn = "warn";
					r.notes.push("turn: forgot context");
				} else {
					r.multiTurn = "fail";
					r.notes.push("turn: empty response");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Tool call (per model)
	// ------------------------------------------------------------------
	describe("tool call (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool call via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/tool-call", { model: model.id });

				if (data.error) {
					r.toolCall = "fail";
					r.notes.push(`tool: ${String(data.error).slice(0, 60)}`);
					return;
				}

				const toolCalls = data.toolCalls as unknown[];
				if (Array.isArray(toolCalls) && toolCalls.length > 0) {
					r.toolCall = "ok";
				} else if (typeof data.text === "string" && (data.text as string).length > 0) {
					r.toolCall = "warn";
					r.notes.push("tool: answered as text");
				} else {
					r.toolCall = "fail";
					r.notes.push("tool: no tool call or content");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Tool round-trip (per model)
	// ------------------------------------------------------------------
	describe("tool round-trip (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool round-trip via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/tool-roundtrip", { model: model.id });

				if (data.error) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: ${String(data.error).slice(0, 60)}`);
					return;
				}

				const steps = data.steps as number;
				const text = data.text as string;
				const toolCalls = data.toolCalls as unknown[];

				if (steps > 1 && text && text.length > 0) {
					r.toolRoundTrip = "ok";
				} else if (Array.isArray(toolCalls) && toolCalls.length > 0) {
					r.toolRoundTrip = "warn";
					r.notes.push("t-rt: tool called but no final text");
				} else if (text && text.length > 0) {
					r.toolRoundTrip = "warn";
					r.notes.push("t-rt: skipped tool, answered directly");
				} else {
					r.toolRoundTrip = "fail";
					r.notes.push("t-rt: empty response");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Multi-step agentic tool loop (per model)
	// ------------------------------------------------------------------
	describe("tool multi-step agentic loop (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — multi-step tool loop via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/tool-multistep", { model: model.id });

				if (data.error) {
					r.toolMultiStep = "fail";
					r.notes.push(`t-ms: ${String(data.error).slice(0, 60)}`);
					return;
				}

				const steps = data.steps as number;
				const toolCallCount = data.toolCallCount as number;
				const text = data.text as string;

				if (toolCallCount >= 2 && text && text.length > 0) {
					r.toolMultiStep = "ok";
				} else if (toolCallCount >= 1) {
					r.toolMultiStep = "warn";
					r.notes.push(`t-ms: only ${toolCallCount} tool call(s), ${steps} step(s)`);
				} else if (text && text.length > 0) {
					r.toolMultiStep = "warn";
					r.notes.push("t-ms: skipped tools, answered directly");
				} else {
					r.toolMultiStep = "fail";
					r.notes.push("t-ms: empty response");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// toolChoice: "required" (per model)
	// ------------------------------------------------------------------
	describe("toolChoice required (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — toolChoice required via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/tool-required", { model: model.id });

				if (data.error) {
					r.toolRequired = "fail";
					r.notes.push(`t-rq: ${String(data.error).slice(0, 60)}`);
					return;
				}

				const toolCalls = data.toolCalls as unknown[];
				if (Array.isArray(toolCalls) && toolCalls.length > 0) {
					r.toolRequired = "ok";
				} else if (typeof data.text === "string" && (data.text as string).length > 0) {
					r.toolRequired = "warn";
					r.notes.push("t-rq: answered as text despite required");
				} else {
					r.toolRequired = "fail";
					r.notes.push("t-rq: no tool call or content");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Structured output (per model)
	// ------------------------------------------------------------------
	describe("structured output (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — structured output via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/structured", { model: model.id });

				if (data.error) {
					r.structuredOutput = "fail";
					r.notes.push(`json: ${String(data.error).slice(0, 60)}`);
					return;
				}

				const result = data.result as Record<string, unknown> | undefined;
				if (
					result &&
					typeof result.name === "string" &&
					typeof result.capital === "string"
				) {
					r.structuredOutput = "ok";
				} else {
					r.structuredOutput = "warn";
					r.notes.push("json: wrong shape");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Vision — image input via binding
	// ------------------------------------------------------------------
	describe("vision — image input (binding)", () => {
		function createTestPng(): number[] {
			const base64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			return Array.from(bytes);
		}

		it("uform-gen2 — vision via binding (legacy image-to-text)", async () => {
			if (!serverReady) return;

			const imageBytes = createTestPng();
			const data = await post("/chat/vision", {
				model: "@cf/unum/uform-gen2-qwen-500m",
				imageBytes,
			});

			if (data.error) {
				console.warn(`  [vision] uform-gen2 error: ${String(data.error).slice(0, 120)}`);
				return;
			}

			if (typeof data.text === "string" && (data.text as string).length > 0) {
				console.log(`  [vision] uform-gen2 OK — "${(data.text as string).slice(0, 100)}"`);
			}
		}, 30_000);
	});

	// ------------------------------------------------------------------
	// Image generation
	// ------------------------------------------------------------------
	describe("image generation", () => {
		it("Flux 1 Schnell — should generate an image via binding", async () => {
			if (!serverReady) return;

			const data = await post("/image");

			if (data.error) {
				console.warn(`  [image] error: ${String(data.error).slice(0, 80)}`);
				return;
			}

			expect(data.imageCount).toBe(1);
			expect(data.imageSize).toBeGreaterThan(100);
			console.log(`  [image] Flux 1 Schnell OK — ${data.imageSize} bytes`);
		});
	});

	// ------------------------------------------------------------------
	// Embeddings
	// ------------------------------------------------------------------
	describe("embeddings", () => {
		it("BGE Base EN — should generate embeddings via binding", async () => {
			if (!serverReady) return;

			const data = await post("/embed");

			if (data.error) {
				console.warn(`  [embed] error: ${String(data.error).slice(0, 80)}`);
				return;
			}

			expect(data.count).toBe(2);
			expect(data.dimensions).toBe(768);
			console.log(`  [embed] BGE Base EN OK — ${data.dimensions} dimensions`);
		});

		it("EmbeddingGemma 300M — should generate multilingual embeddings via binding", async () => {
			if (!serverReady) return;

			const data = await post("/embed", { model: "@cf/google/embeddinggemma-300m" });

			if (data.error) {
				console.warn(`  [embed] error: ${String(data.error).slice(0, 80)}`);
				return;
			}

			expect(data.count).toBe(2);
			expect(data.dimensions as number).toBeGreaterThan(0);
			console.log(`  [embed] EmbeddingGemma 300M OK — ${data.dimensions} dimensions`);
		});
	});

	// ------------------------------------------------------------------
	// AI Search tests (only run if AI_SEARCH binding is configured)
	// ------------------------------------------------------------------
	describe("AI Search", () => {
		it("AI Search — basic chat", async () => {
			if (!serverReady) return;

			const data = await post("/aisearch/chat", { model: "What is Cloudflare Workers?" });

			if (data.skipped) {
				console.log("  [aisearch] Skipped: AI_SEARCH binding not configured");
				return;
			}

			if (data.error) {
				console.warn(`  [aisearch] chat error: ${String(data.error).slice(0, 80)}`);
				return;
			}

			expect(typeof data.text).toBe("string");
			expect((data.text as string).length).toBeGreaterThan(0);
			console.log(`  [aisearch] chat OK: "${(data.text as string).slice(0, 80)}..."`);
		});

		it("AI Search — streaming (skippable)", async () => {
			if (!serverReady) return;

			const data = await post("/aisearch/stream", { model: "What is Cloudflare Workers?" });

			if (data.skipped) {
				console.log("  [aisearch] Skipped: AI_SEARCH binding not configured");
				return;
			}

			if (data.error) {
				console.warn(`  [aisearch] stream error: ${String(data.error).slice(0, 80)}`);
				return;
			}

			expect(typeof data.text).toBe("string");
			expect((data.text as string).length).toBeGreaterThan(0);
			console.log(`  [aisearch] stream OK: "${(data.text as string).slice(0, 80)}..."`);
		});
	});

	// ------------------------------------------------------------------
	// Transcription via binding
	// ------------------------------------------------------------------
	describe("transcription via binding", () => {
		/**
		 * Generate a 440Hz tone WAV as number[] for JSON transport.
		 */
		function createToneWavBytes(durationMs = 500): number[] {
			const sampleRate = 16000;
			const numSamples = Math.floor((sampleRate * durationMs) / 1000);
			const bytesPerSample = 2;
			const dataSize = numSamples * bytesPerSample;
			const buffer = new ArrayBuffer(44 + dataSize);
			const view = new DataView(buffer);
			const writeStr = (offset: number, str: string) => {
				for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
			};
			writeStr(0, "RIFF");
			view.setUint32(4, 36 + dataSize, true);
			writeStr(8, "WAVE");
			writeStr(12, "fmt ");
			view.setUint32(16, 16, true);
			view.setUint16(20, 1, true);
			view.setUint16(22, 1, true);
			view.setUint32(24, sampleRate, true);
			view.setUint32(28, sampleRate * bytesPerSample, true);
			view.setUint16(32, bytesPerSample, true);
			view.setUint16(34, 16, true);
			writeStr(36, "data");
			view.setUint32(40, dataSize, true);
			const freq = 440;
			const amplitude = 16000;
			for (let i = 0; i < numSamples; i++) {
				const sample = Math.round(
					amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate),
				);
				view.setInt16(44 + i * bytesPerSample, sample, true);
			}
			return Array.from(new Uint8Array(buffer));
		}

		it("Whisper — transcribes audio via binding", async () => {
			if (!serverReady) return;

			const audio = createToneWavBytes(500);
			const data = await post("/transcription", {
				model: "@cf/openai/whisper",
				audio,
			});

			if (data.error) {
				console.log(`  [transcription] Whisper binding: ${data.error}`);
				return;
			}

			expect(typeof data.text).toBe("string");
			console.log(
				`  [transcription] Whisper binding OK — "${(data.text as string).slice(0, 50)}"`,
			);
		});

		it("Whisper Tiny EN — transcribes audio via binding", async () => {
			if (!serverReady) return;

			const audio = createToneWavBytes(500);
			const data = await post("/transcription", {
				model: "@cf/openai/whisper-tiny-en",
				audio,
			});

			if (data.error) {
				console.log(`  [transcription] Whisper Tiny EN binding: ${data.error}`);
				return;
			}

			expect(typeof data.text).toBe("string");
			console.log(
				`  [transcription] Whisper Tiny EN binding OK — "${(data.text as string).slice(0, 50)}"`,
			);
		});

		it("Whisper Large v3 Turbo — transcribes audio via binding", async () => {
			if (!serverReady) return;

			const audio = createToneWavBytes(500);
			const data = await post("/transcription", {
				model: "@cf/openai/whisper-large-v3-turbo",
				audio,
			});

			if (data.error) {
				console.log(`  [transcription] v3 Turbo binding: ${data.error}`);
				return;
			}

			expect(typeof data.text).toBe("string");
			console.log(
				`  [transcription] v3 Turbo binding OK — "${(data.text as string).slice(0, 50)}"`,
			);
		});
	});

	// ------------------------------------------------------------------
	// Reranking via binding
	// ------------------------------------------------------------------
	describe("reranking via binding", () => {
		it("BGE Reranker Base — reranks documents via binding", async () => {
			if (!serverReady) return;

			const data = await post("/rerank", {
				query: "What is machine learning?",
				documents: [
					"Machine learning is a branch of AI.",
					"The weather is sunny today.",
					"Deep learning uses neural networks.",
				],
			});

			if (data.error) {
				console.log(`  [rerank] binding: ${data.error}`);
				return;
			}

			expect(data.rankingCount).toBeGreaterThan(0);
			console.log(
				`  [rerank] BGE Reranker binding OK — ${data.rankingCount} results, top: index ${data.topIndex} (${Number(data.topScore).toFixed(3)})`,
			);
		});
	});

	// ------------------------------------------------------------------
	// Speech (TTS) via binding
	// ------------------------------------------------------------------
	describe("speech via binding", () => {
		it("Deepgram Aura-1 — generates speech via binding", async () => {
			if (!serverReady) return;

			const data = await post("/speech", {
				text: "Hello from the binding test.",
			});

			if (data.error) {
				console.log(`  [speech] Aura-1 binding: ${data.error}`);
				return;
			}

			expect(data.audioLength).toBeGreaterThan(100);
			console.log(`  [speech] Aura-1 binding OK — ${data.audioLength} bytes`);
		});

		it("Deepgram Aura-2 EN — generates speech via binding", async () => {
			if (!serverReady) return;

			const data = await post("/speech", {
				model: "@cf/deepgram/aura-2-en",
				text: "Hello from the Aura two binding test.",
			});

			if (data.error) {
				console.log(`  [speech] Aura-2 EN binding: ${data.error}`);
				return;
			}

			expect(data.audioLength).toBeGreaterThan(100);
			console.log(`  [speech] Aura-2 EN binding OK — ${data.audioLength} bytes`);
		});
	});
});
