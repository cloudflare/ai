import { describe, expect, it } from "vitest";
import {
	isDirectBindingConfig,
	isDirectCredentialsConfig,
	isGatewayConfig,
	validateWorkersAiConfig,
	type WorkersAiAdapterConfig,
} from "../src/utils/create-fetcher";

// ---------------------------------------------------------------------------
// Config detection helpers
// ---------------------------------------------------------------------------

describe("config detection", () => {
	it("isDirectBindingConfig: detects plain Workers AI binding ({ binding: env.AI })", () => {
		const binding = {
			run: (_model: string, _inputs: Record<string, unknown>) => Promise.resolve({}),
			gateway: (_id: string) => ({
				run: (_req: unknown) => Promise.resolve(new Response("ok")),
			}),
		};
		const config: WorkersAiAdapterConfig = { binding };
		expect(isDirectBindingConfig(config)).toBe(true);
	});

	it("isDirectBindingConfig: rejects gateway binding ({ binding: env.AI.gateway(id) })", () => {
		const binding = {
			run: (_request: unknown) => Promise.resolve(new Response("ok")),
		};
		const config: WorkersAiAdapterConfig = { binding };
		expect(isDirectBindingConfig(config)).toBe(false);
	});

	it("isDirectBindingConfig: rejects plain REST credentials", () => {
		const config: WorkersAiAdapterConfig = {
			accountId: "abc",
			apiKey: "key",
		};
		expect(isDirectBindingConfig(config)).toBe(false);
	});

	it("isDirectCredentialsConfig: detects plain REST credentials", () => {
		const config: WorkersAiAdapterConfig = {
			accountId: "abc",
			apiKey: "key",
		};
		expect(isDirectCredentialsConfig(config)).toBe(true);
	});

	it("isDirectCredentialsConfig: rejects gateway credentials (has gatewayId)", () => {
		const config = {
			accountId: "abc",
			apiKey: "key",
			gatewayId: "gw-1",
		} as WorkersAiAdapterConfig;
		expect(isDirectCredentialsConfig(config)).toBe(false);
	});

	it("isGatewayConfig: detects gateway binding ({ binding: ... })", () => {
		const binding = {
			run: (_request: unknown) => Promise.resolve(new Response("ok")),
		};
		const config: WorkersAiAdapterConfig = { binding };
		expect(isGatewayConfig(config)).toBe(true);
	});

	it("isGatewayConfig: detects gateway credentials ({ gatewayId: ... })", () => {
		const config = {
			accountId: "abc",
			gatewayId: "gw-1",
		} as WorkersAiAdapterConfig;
		expect(isGatewayConfig(config)).toBe(true);
	});

	it("isGatewayConfig: rejects plain binding ({ binding: env.AI })", () => {
		const binding = {
			run: (_model: string, _inputs: Record<string, unknown>) => Promise.resolve({}),
			gateway: (_id: string) => ({
				run: (_req: unknown) => Promise.resolve(new Response("ok")),
			}),
		};
		const config: WorkersAiAdapterConfig = { binding };
		expect(isGatewayConfig(config)).toBe(false);
	});

	it("isGatewayConfig: rejects plain REST", () => {
		const config: WorkersAiAdapterConfig = {
			accountId: "abc",
			apiKey: "key",
		};
		expect(isGatewayConfig(config)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// validateWorkersAiConfig
// ---------------------------------------------------------------------------

describe("validateWorkersAiConfig", () => {
	it("accepts plain Workers AI binding config", () => {
		const binding = {
			run: (_model: string, _inputs: Record<string, unknown>) => Promise.resolve({}),
			gateway: (_id: string) => ({
				run: (_req: unknown) => Promise.resolve(new Response("ok")),
			}),
		};
		expect(() => validateWorkersAiConfig({ binding })).not.toThrow();
	});

	it("accepts plain REST credentials config", () => {
		expect(() => validateWorkersAiConfig({ accountId: "abc", apiKey: "key" })).not.toThrow();
	});

	it("accepts gateway binding config", () => {
		const binding = {
			run: (_request: unknown) => Promise.resolve(new Response("ok")),
		};
		expect(() => validateWorkersAiConfig({ binding })).not.toThrow();
	});

	it("accepts gateway credentials config", () => {
		const config = {
			accountId: "abc",
			gatewayId: "gw-1",
		} as WorkersAiAdapterConfig;
		expect(() => validateWorkersAiConfig(config)).not.toThrow();
	});

	it("throws for empty config", () => {
		expect(() => validateWorkersAiConfig({} as WorkersAiAdapterConfig)).toThrow(
			/Invalid Workers AI configuration/,
		);
	});

	it("throws for config with only unrelated properties", () => {
		expect(() =>
			validateWorkersAiConfig({ foo: "bar" } as unknown as WorkersAiAdapterConfig),
		).toThrow(/Invalid Workers AI configuration/);
	});

	it("throws for config with only accountId (missing apiKey)", () => {
		expect(() =>
			validateWorkersAiConfig({ accountId: "abc" } as unknown as WorkersAiAdapterConfig),
		).toThrow(/Invalid Workers AI configuration/);
	});

	it("throws for config with only apiKey (missing accountId)", () => {
		expect(() =>
			validateWorkersAiConfig({ apiKey: "key" } as unknown as WorkersAiAdapterConfig),
		).toThrow(/Invalid Workers AI configuration/);
	});

	it("error message mentions binding and credentials", () => {
		try {
			validateWorkersAiConfig({} as WorkersAiAdapterConfig);
		} catch (e) {
			expect((e as Error).message).toContain("binding");
			expect((e as Error).message).toContain("credentials");
		}
	});
});
