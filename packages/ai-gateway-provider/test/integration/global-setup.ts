import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const INTEGRATION_DIR = resolve(__dirname);
const WORKER_DIR = resolve(INTEGRATION_DIR, "worker");
const PORT = process.env.INTEGRATION_WORKER_PORT || "8787";
const ENV_FILE = resolve(INTEGRATION_DIR, ".env");

let wrangler: ChildProcess | undefined;

function loadEnvFile() {
	if (!existsSync(ENV_FILE)) {
		console.warn(
			`\n⚠ No .env file found at ${ENV_FILE}`,
			"\n  Copy .env.example to .env and fill in your values.\n",
		);
		return;
	}

	const content = readFileSync(ENV_FILE, "utf-8");
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex);
		const value = trimmed.slice(eqIndex + 1);
		if (!process.env[key]) {
			process.env[key] = value;
		}
	}
}

export async function setup() {
	loadEnvFile();

	console.log("\nStarting wrangler dev...");

	wrangler = spawn("npx", ["wrangler", "dev", "--port", PORT, "--env-file", ENV_FILE], {
		cwd: WORKER_DIR,
		stdio: "pipe",
		env: { ...process.env },
	});

	let stderrOutput = "";

	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(
				new Error(
					`Wrangler dev startup timed out after 30s.\n` +
						`Make sure you've run \`npx wrangler login\` and created test/integration/.env\n` +
						`stderr: ${stderrOutput}`,
				),
			);
		}, 30000);

		wrangler!.stdout?.on("data", (data: Buffer) => {
			const output = data.toString();
			if (output.includes("Ready on")) {
				clearTimeout(timeout);
				console.log(`Wrangler dev ready on port ${PORT}`);
				resolve();
			}
		});

		wrangler!.stderr?.on("data", (data: Buffer) => {
			stderrOutput += data.toString();
		});

		wrangler!.on("exit", (code) => {
			if (code !== null && code !== 0) {
				clearTimeout(timeout);
				reject(
					new Error(
						`Wrangler dev exited with code ${code}.\n` +
							`Make sure you've run \`npx wrangler login\`.\n` +
							`stderr: ${stderrOutput}`,
					),
				);
			}
		});
	});
}

export async function teardown() {
	if (!wrangler) return;

	wrangler.kill("SIGTERM");

	await new Promise<void>((resolve) => {
		const forceKill = setTimeout(() => {
			wrangler?.kill("SIGKILL");
			resolve();
		}, 5000);

		wrangler!.on("close", () => {
			clearTimeout(forceKill);
			resolve();
		});
	});

	console.log("Wrangler dev stopped.");
}
