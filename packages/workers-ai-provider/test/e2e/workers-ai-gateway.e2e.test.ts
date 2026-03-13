/**
 * E2E tests for Workers AI routed through AI Gateway via the binding's
 * built-in `gateway` option.
 *
 * These tests reuse the same binding-worker as the other binding e2e tests,
 * but pass a `?gateway=<name>` query parameter so the worker creates the
 * provider with `gateway: { id }`.
 *
 * Prerequisites:
 *   - Authenticated with Cloudflare (`wrangler login`)
 *   - An AI Gateway configured in your Cloudflare dashboard
 *   - Set WORKERS_AI_GATEWAY_NAME env var (or defaults to "test-gateway")
 *
 * Run with: pnpm test:e2e:binding
 */
import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WORKER_DIR = new URL("./fixtures/binding-worker", import.meta.url).pathname;
const PORT = 8798;
const BASE = `http://localhost:${PORT}`;
const GATEWAY_NAME = process.env.WORKERS_AI_GATEWAY_NAME || "test-gateway";

async function post(
	path: string,
	body: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
	const url = new URL(path, BASE);
	url.searchParams.set("gateway", GATEWAY_NAME);
	const res = await fetch(url, {
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
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}

let wranglerProcess: ChildProcess | null = null;
let serverReady = false;

describe("Workers AI via AI Gateway (binding)", () => {
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
			console.error("[gateway-e2e] Failed to start wrangler:", err.message);
		});

		serverReady = await waitForReady(`${BASE}/health`, 50_000);
		if (!serverReady) {
			console.error("[gateway-e2e] wrangler dev failed to start within 50s");
			if (stderr) console.error("[gateway-e2e] stderr:", stderr);
		}
	}, 60_000);

	afterAll(async () => {
		if (wranglerProcess) {
			wranglerProcess.kill("SIGTERM");
			await new Promise((r) => setTimeout(r, 1_000));
			if (!wranglerProcess.killed) {
				wranglerProcess.kill("SIGKILL");
			}
			wranglerProcess = null;
		}
	}, 10_000);

	describe("chat via gateway", () => {
		it("should generate text through AI Gateway", async () => {
			if (!serverReady) return;

			const data = await post("/chat", {
				model: "@cf/meta/llama-3.1-8b-instruct-fast",
			});

			if (data.error) {
				console.error("[gateway] chat error:", data.error);
			}
			expect(data.error).toBeUndefined();
			expect(typeof data.text).toBe("string");
			expect((data.text as string).length).toBeGreaterThan(0);
		});

		it("should stream text through AI Gateway", async () => {
			if (!serverReady) return;

			const data = await post("/chat/stream", {
				model: "@cf/meta/llama-3.1-8b-instruct-fast",
			});

			if (data.error) {
				console.error("[gateway] stream error:", data.error);
			}
			expect(data.error).toBeUndefined();
			expect(typeof data.text).toBe("string");
			expect((data.text as string).length).toBeGreaterThan(0);
		});
	});

	describe("multi-turn via gateway", () => {
		it("should remember context across turns", async () => {
			if (!serverReady) return;

			const data = await post("/chat/multi-turn", {
				model: "@cf/meta/llama-3.1-8b-instruct-fast",
			});

			if (data.error) {
				console.error("[gateway] multi-turn error:", data.error);
			}
			expect(data.error).toBeUndefined();
			expect(typeof data.text).toBe("string");
			expect((data.text as string).toLowerCase()).toContain("alice");
		});
	});

	describe("tool calling via gateway", () => {
		it("should make tool calls through AI Gateway", async () => {
			if (!serverReady) return;

			const data = await post("/chat/tool-call", {
				model: "@cf/meta/llama-3.1-8b-instruct-fast",
			});

			if (data.error) {
				console.error("[gateway] tool-call error:", data.error);
			}
			expect(data.error).toBeUndefined();
			const toolCalls = data.toolCalls as unknown[];
			expect(Array.isArray(toolCalls)).toBe(true);
			expect(toolCalls.length).toBeGreaterThan(0);
		});
	});

	describe("structured output via gateway", () => {
		it("should return structured output through AI Gateway", async () => {
			if (!serverReady) return;

			const data = await post("/chat/structured", {
				model: "@cf/meta/llama-3.1-8b-instruct-fast",
			});

			if (data.error) {
				console.error("[gateway] structured error:", data.error);
			}
			expect(data.error).toBeUndefined();
			const result = data.result as Record<string, unknown>;
			expect(result).toBeDefined();
			expect(typeof result.name).toBe("string");
			expect(typeof result.capital).toBe("string");
		});
	});

	describe("embeddings via gateway", () => {
		it("should generate embeddings through AI Gateway", async () => {
			if (!serverReady) return;

			const data = await post("/embed", {
				model: "@cf/baai/bge-base-en-v1.5",
			});

			if (data.error) {
				console.error("[gateway] embed error:", data.error);
			}
			expect(data.error).toBeUndefined();
			expect(data.count).toBe(2);
			expect(data.dimensions).toBe(768);
		});
	});

	describe("image generation via gateway", () => {
		it("should generate images through AI Gateway", async () => {
			if (!serverReady) return;

			const data = await post("/image", {
				model: "@cf/black-forest-labs/flux-1-schnell",
			});

			if (data.error) {
				console.error("[gateway] image error:", data.error);
			}
			expect(data.error).toBeUndefined();
			expect(data.imageCount).toBe(1);
			expect(data.imageSize as number).toBeGreaterThan(100);
		});
	});
});
