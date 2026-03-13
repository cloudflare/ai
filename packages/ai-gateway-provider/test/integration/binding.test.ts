import { beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests for the AI Gateway binding mode.
 *
 * The global setup (global-setup.ts) loads test/integration/.env and
 * automatically starts `wrangler dev` before tests run.
 *
 * Required setup:
 *   1. Copy test/integration/.env.example to test/integration/.env and fill in values
 *   2. Run: npx wrangler login (if not already authenticated)
 */

const WORKER_URL =
	process.env.INTEGRATION_WORKER_URL ||
	`http://localhost:${process.env.INTEGRATION_WORKER_PORT || "8787"}`;

let workerAvailable = false;
let healthData: {
	unauthGateway: string;
	authGateway: string;
	hasOpenAIKey: boolean;
} | null = null;

beforeAll(async () => {
	try {
		const resp = await fetch(`${WORKER_URL}/health`, {
			signal: AbortSignal.timeout(5000),
		});
		if (resp.ok) {
			workerAvailable = true;
			healthData = (await resp.json()) as typeof healthData;
			console.log("Worker health:", JSON.stringify(healthData, null, 2));
		}
	} catch {
		console.warn("\n⚠ Integration worker not reachable. Skipping binding tests.\n");
	}
});

async function fetchWorker(
	path: string,
	params?: Record<string, string>,
): Promise<{ resp: Response; data: any }> {
	const url = new URL(path, WORKER_URL);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}
	}
	const resp = await fetch(url);
	const data = await resp.json();
	if (!resp.ok) {
		console.error(`Worker error [${path}]:`, JSON.stringify(data, null, 2));
	}
	return { resp, data };
}

// ─── Unauthenticated gateway, user's own API key ────────────────

describe("Integration: Unauthenticated gateway + own API key", () => {
	it("should generate text", async ({ skip }) => {
		if (!workerAvailable) skip();

		const { resp, data } = await fetchWorker("/generate", {
			gateway: healthData!.unauthGateway,
		});
		expect(resp.ok).toBe(true);
		expect(data.text).toBeTruthy();
		expect(typeof data.text).toBe("string");
		expect(data.usage).toBeDefined();
		expect(data.byok).toBe(false);
	});

	it("should stream text", async ({ skip }) => {
		if (!workerAvailable) skip();

		const url = new URL("/stream", WORKER_URL);
		url.searchParams.set("gateway", healthData!.unauthGateway);
		const resp = await fetch(url);
		if (!resp.ok) {
			console.error("Worker error [/stream]:", await resp.text());
		}
		expect(resp.ok).toBe(true);

		const text = await resp.text();
		expect(text).toBeTruthy();
	});

	it("should generate text with gateway options", async ({ skip }) => {
		if (!workerAvailable) skip();

		const { resp, data } = await fetchWorker("/generate-with-options", {
			gateway: healthData!.unauthGateway,
		});
		expect(resp.ok).toBe(true);
		expect(data.text).toBeTruthy();
	});
});

// ─── Authenticated gateway, user's own API key ──────────────────

describe("Integration: Authenticated gateway + own API key", () => {
	it("should generate text", async ({ skip }) => {
		if (!workerAvailable) skip();

		const { resp, data } = await fetchWorker("/generate", {
			gateway: healthData!.authGateway,
		});
		expect(resp.ok).toBe(true);
		expect(data.text).toBeTruthy();
		expect(typeof data.text).toBe("string");
	});

	it("should stream text", async ({ skip }) => {
		if (!workerAvailable) skip();

		const url = new URL("/stream", WORKER_URL);
		url.searchParams.set("gateway", healthData!.authGateway);
		const resp = await fetch(url);
		if (!resp.ok) {
			console.error("Worker error [/stream auth]:", await resp.text());
		}
		expect(resp.ok).toBe(true);

		const text = await resp.text();
		expect(text).toBeTruthy();
	});
});

// ─── Authenticated gateway, BYOK ────────────────────────────────
//     (BYOK requires an authenticated gateway with stored provider keys)

describe("Integration: Authenticated gateway + BYOK", () => {
	it("should generate text with BYOK on authenticated gateway", async ({ skip }) => {
		if (!workerAvailable) skip();

		const { resp, data } = await fetchWorker("/generate", {
			gateway: healthData!.authGateway,
			byok: "true",
		});
		expect(resp.ok).toBe(true);
		expect(data.text).toBeTruthy();
		expect(data.byok).toBe(true);
	});

	it("should stream text with BYOK on authenticated gateway", async ({ skip }) => {
		if (!workerAvailable) skip();

		const url = new URL("/stream", WORKER_URL);
		url.searchParams.set("gateway", healthData!.authGateway);
		url.searchParams.set("byok", "true");
		const resp = await fetch(url);
		if (!resp.ok) {
			console.error("Worker error [/stream auth+byok]:", await resp.text());
		}
		expect(resp.ok).toBe(true);

		const text = await resp.text();
		expect(text).toBeTruthy();
	});
});
