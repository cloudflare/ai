import { describe, expect, it } from "vitest";
import {
	detectProviderByUrl,
	findProviderBySlug,
	GATEWAY_PROVIDERS,
	wireableProviders,
} from "../src/gateway-providers";

describe("findProviderBySlug", () => {
	it("resolves a primary slug", () => {
		const openai = findProviderBySlug("openai");
		expect(openai?.gatewayProviderId).toBe("openai");
		expect(openai?.runCatalog).toBe(true);
		expect(openai?.billing).toBe("unified");
	});

	it("resolves aliases to their canonical entry", () => {
		// grok ⇒ xai (run-catalog author), google-ai-studio ⇒ google, bedrock ⇒ aws-bedrock
		expect(findProviderBySlug("grok")?.resolverKey).toBe("xai");
		expect(findProviderBySlug("google-ai-studio")?.gatewayProviderId).toBe("google-ai-studio");
		expect(findProviderBySlug("bedrock")?.gatewayProviderId).toBe("aws-bedrock");
		expect(findProviderBySlug("azure")?.resolverKey).toBe("azure-openai");
	});

	it("resolves the Moonshot AI unified catalog slug", () => {
		expect(findProviderBySlug("moonshotai")).toMatchObject({
			gatewayProviderId: "moonshotai",
			wireFormat: "openai",
			runCatalog: true,
			gatewayPath: false,
			billing: "unified",
		});
	});

	it("maps google ⇒ google-ai-studio gateway id, anthropic native run wire", () => {
		expect(findProviderBySlug("google")?.gatewayProviderId).toBe("google-ai-studio");
		const anthropic = findProviderBySlug("anthropic");
		expect(anthropic?.gatewayProviderId).toBe("anthropic");
	});

	it("returns undefined for an unknown slug", () => {
		expect(findProviderBySlug("nope")).toBeUndefined();
	});
});

describe("registry invariants", () => {
	it("has unique resolver keys", () => {
		const keys = GATEWAY_PROVIDERS.map((p) => p.resolverKey);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("BYOK providers are not on the resumable run catalog", () => {
		for (const p of GATEWAY_PROVIDERS) {
			if (p.billing === "byok") expect(p.runCatalog).toBe(false);
		}
	});

	it("every provider declares at least one auth header", () => {
		for (const p of GATEWAY_PROVIDERS) {
			expect(Array.isArray(p.authHeaders)).toBe(true);
		}
	});

	it("wireableProviders are exactly those with a built-in parser", () => {
		const wireable = wireableProviders();
		expect(wireable.length).toBeGreaterThan(0);
		for (const p of wireable) expect(p.wireFormat).toBeDefined();
		for (const p of GATEWAY_PROVIDERS) {
			if (p.wireFormat === undefined) expect(wireable).not.toContain(p);
		}
	});
});

describe("detectProviderByUrl", () => {
	it("matches provider hosts (BYOG detection)", () => {
		expect(detectProviderByUrl("https://api.openai.com/v1/chat/completions")?.resolverKey).toBe(
			"openai",
		);
		expect(detectProviderByUrl("https://api.anthropic.com/v1/messages")?.resolverKey).toBe(
			"anthropic",
		);
		expect(detectProviderByUrl("https://api.x.ai/v1/chat/completions")?.resolverKey).toBe(
			"xai",
		);
	});

	it("returns undefined for an unrecognized host", () => {
		expect(detectProviderByUrl("https://example.com/v1/foo")).toBeUndefined();
	});
});

describe("transformEndpoint host-stripping", () => {
	it("strips the openai host to the gateway-native endpoint", () => {
		const openai = findProviderBySlug("openai");
		expect(openai?.transformEndpoint?.("https://api.openai.com/v1/chat/completions")).toBe(
			"v1/chat/completions",
		);
	});

	it("strips groq's /openai/v1 prefix", () => {
		const groq = findProviderBySlug("groq");
		expect(groq?.transformEndpoint?.("https://api.groq.com/openai/v1/chat/completions")).toBe(
			"chat/completions",
		);
	});

	it("preserves the AWS region for bedrock", () => {
		const bedrock = findProviderBySlug("aws-bedrock");
		expect(
			bedrock?.transformEndpoint?.(
				"https://bedrock-runtime.us-east-1.amazonaws.com/model/foo/invoke",
			),
		).toBe("bedrock-runtime/us-east-1/model/foo/invoke");
	});
});
