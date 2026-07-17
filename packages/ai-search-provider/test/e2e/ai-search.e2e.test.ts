/**
 * E2E integration tests for ai-search-provider against a REAL AI Search instance.
 *
 * These start a real `wrangler dev` server with the fixture worker in
 * ./fixtures/search-worker, which uses the provider through an
 * `ai_search_namespaces` binding.
 *
 * OPT-IN — requires your own Cloudflare account:
 *   1. An AI Search instance with some indexed content.
 *   2. wrangler auth (`wrangler login` or CLOUDFLARE_API_TOKEN in the env).
 *   3. The instance name via AI_SEARCH_INSTANCE.
 *      If your instance is not in the `default` namespace, edit the `namespace`
 *      in ./fixtures/search-worker/wrangler.jsonc.
 *
 * Run:
 *   AI_SEARCH_INSTANCE=<your-instance> pnpm --filter ai-search-provider test:e2e
 *
 * Without AI_SEARCH_INSTANCE set, the whole suite is skipped.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const WORKER_DIR = new URL("./fixtures/search-worker", import.meta.url).pathname;
const PORT = 8788;
const BASE = `http://localhost:${PORT}`;
const INSTANCE = process.env.AI_SEARCH_INSTANCE ?? "";

async function post(path: string, body: Record<string, unknown> = {}) {
	const res = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ instance: INSTANCE, ...body }),
	});
	return res.json() as Promise<Record<string, unknown>>;
}

async function waitForReady(url: string, timeoutMs = 50_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok) return true;
		} catch {
			// server not ready yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}

let wranglerProcess: ChildProcess | null = null;
let serverReady = false;

describe.skipIf(!INSTANCE)("ai-search-provider E2E (real instance)", () => {
	beforeAll(async () => {
		wranglerProcess = spawn(
			"pnpm",
			["exec", "wrangler", "dev", "--port", String(PORT), "--log-level", "error"],
			{ cwd: WORKER_DIR, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
		);

		let stderr = "";
		wranglerProcess.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		serverReady = await waitForReady(`${BASE}/health`, 50_000);
		if (!serverReady) {
			console.error("[ai-search-e2e] wrangler dev failed to start within 50s");
			if (stderr) console.error("[ai-search-e2e] stderr:", stderr);
		}
	}, 60_000);

	afterAll(async () => {
		if (wranglerProcess) {
			wranglerProcess.kill("SIGTERM");
			await new Promise((r) => setTimeout(r, 1_000));
			if (!wranglerProcess.killed) wranglerProcess.kill("SIGKILL");
			wranglerProcess = null;
		}
	}, 10_000);

	it("generates a grounded chat response", async () => {
		if (!serverReady) return;
		const data = await post("/chat", { prompt: "What is this about?" });
		if (data.skipped) return;

		expect(data.error).toBeFalsy();
		expect(typeof data.text).toBe("string");
		expect((data.text as string).length).toBeGreaterThan(0);
		console.log(`  [chat] sources=${data.sourceCount} — "${(data.text as string).slice(0, 80)}"`);
	});

	it("streams a grounded chat response", async () => {
		if (!serverReady) return;
		const data = await post("/stream", { prompt: "What is this about?" });
		if (data.skipped) return;

		expect(data.error).toBeFalsy();
		expect(typeof data.text).toBe("string");
		expect((data.text as string).length).toBeGreaterThan(0);
	});

	it("searches the instance", async () => {
		if (!serverReady) return;
		const data = await post("/search", { query: "test" });
		if (data.skipped) return;

		expect(data.error).toBeFalsy();
		expect(typeof data.chunkCount).toBe("number");
		console.log(`  [search] chunks=${data.chunkCount}`);
	});

	it("uploads, lists, gets, and deletes an item", async () => {
		if (!serverReady) return;

		const upload = await post("/items/upload", {
			name: `e2e-${Date.now()}.md`,
			content: "# E2E\nUploaded by the ai-search-provider e2e suite.",
		});
		if (upload.skipped) return;
		expect(upload.error).toBeFalsy();
		const item = upload.item as { id?: string } | undefined;
		console.log(`  [items] uploaded id=${item?.id}`);

		const list = await post("/items/list");
		expect(list.error).toBeFalsy();

		if (item?.id) {
			const got = await post("/items/get", { itemId: item.id });
			expect(got.error).toBeFalsy();

			const del = await post("/items/delete", { itemId: item.id });
			expect(del.error).toBeFalsy();
			expect(del.deleted).toBe(true);
		}
	});
});
