import { describe, expect, it } from "vitest";
import { parseAiGatewayOptions } from "../../src";

describe("parseAiGatewayOptions", () => {
	it("should return empty headers for empty options", () => {
		const headers = parseAiGatewayOptions({});
		expect([...headers.entries()]).toHaveLength(0);
	});

	it("should set cf-aig-skip-cache when skipCache is true", () => {
		const headers = parseAiGatewayOptions({ skipCache: true });
		expect(headers.get("cf-aig-skip-cache")).toBe("true");
	});

	it("should not set cf-aig-skip-cache when skipCache is false", () => {
		const headers = parseAiGatewayOptions({ skipCache: false });
		expect(headers.get("cf-aig-skip-cache")).toBeNull();
	});

	it("should set cf-aig-cache-ttl", () => {
		const headers = parseAiGatewayOptions({ cacheTtl: 3600 });
		expect(headers.get("cf-aig-cache-ttl")).toBe("3600");
	});

	it("should set cf-aig-cache-ttl to 0", () => {
		const headers = parseAiGatewayOptions({ cacheTtl: 0 });
		expect(headers.get("cf-aig-cache-ttl")).toBe("0");
	});

	it("should set cf-aig-cache-key", () => {
		const headers = parseAiGatewayOptions({ cacheKey: "my-key" });
		expect(headers.get("cf-aig-cache-key")).toBe("my-key");
	});

	it("should set cf-aig-metadata as JSON", () => {
		const metadata = { userId: "123", env: "prod" };
		const headers = parseAiGatewayOptions({ metadata });
		expect(headers.get("cf-aig-metadata")).toBe(JSON.stringify(metadata));
	});

	it("should set cf-aig-collect-log to true", () => {
		const headers = parseAiGatewayOptions({ collectLog: true });
		expect(headers.get("cf-aig-collect-log")).toBe("true");
	});

	it("should set cf-aig-collect-log to false", () => {
		const headers = parseAiGatewayOptions({ collectLog: false });
		expect(headers.get("cf-aig-collect-log")).toBe("false");
	});

	it("should set cf-aig-event-id", () => {
		const headers = parseAiGatewayOptions({ eventId: "evt-123" });
		expect(headers.get("cf-aig-event-id")).toBe("evt-123");
	});

	it("should set cf-aig-request-timeout", () => {
		const headers = parseAiGatewayOptions({ requestTimeoutMs: 5000 });
		expect(headers.get("cf-aig-request-timeout")).toBe("5000");
	});

	it("should set retry headers", () => {
		const headers = parseAiGatewayOptions({
			retries: {
				maxAttempts: 3,
				retryDelayMs: 1000,
				backoff: "exponential",
			},
		});
		expect(headers.get("cf-aig-max-attempts")).toBe("3");
		expect(headers.get("cf-aig-retry-delay")).toBe("1000");
		expect(headers.get("cf-aig-backoff")).toBe("exponential");
	});

	it("should handle partial retry config", () => {
		const headers = parseAiGatewayOptions({
			retries: { maxAttempts: 2 },
		});
		expect(headers.get("cf-aig-max-attempts")).toBe("2");
		expect(headers.get("cf-aig-retry-delay")).toBeNull();
		expect(headers.get("cf-aig-backoff")).toBeNull();
	});

	it("should set cf-aig-byok-alias", () => {
		const headers = parseAiGatewayOptions({ byokAlias: "production" });
		expect(headers.get("cf-aig-byok-alias")).toBe("production");
	});

	it("should set cf-aig-zdr to true", () => {
		const headers = parseAiGatewayOptions({ zdr: true });
		expect(headers.get("cf-aig-zdr")).toBe("true");
	});

	it("should set cf-aig-zdr to false", () => {
		const headers = parseAiGatewayOptions({ zdr: false });
		expect(headers.get("cf-aig-zdr")).toBe("false");
	});

	it("should set all options together", () => {
		const headers = parseAiGatewayOptions({
			skipCache: true,
			cacheTtl: 7200,
			cacheKey: "combo-key",
			metadata: { test: true },
			collectLog: true,
			eventId: "evt-456",
			requestTimeoutMs: 10000,
			retries: { maxAttempts: 5, backoff: "linear" },
			byokAlias: "prod",
			zdr: true,
		});
		expect(headers.get("cf-aig-skip-cache")).toBe("true");
		expect(headers.get("cf-aig-cache-ttl")).toBe("7200");
		expect(headers.get("cf-aig-cache-key")).toBe("combo-key");
		expect(headers.get("cf-aig-metadata")).toBe('{"test":true}');
		expect(headers.get("cf-aig-collect-log")).toBe("true");
		expect(headers.get("cf-aig-event-id")).toBe("evt-456");
		expect(headers.get("cf-aig-request-timeout")).toBe("10000");
		expect(headers.get("cf-aig-max-attempts")).toBe("5");
		expect(headers.get("cf-aig-backoff")).toBe("linear");
		expect(headers.get("cf-aig-byok-alias")).toBe("prod");
		expect(headers.get("cf-aig-zdr")).toBe("true");
	});
});
