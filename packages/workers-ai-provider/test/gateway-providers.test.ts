import { describe, expect, it } from "vitest";
import {
	detectProviderByUrl,
	findProviderBySlug,
	GATEWAY_PROVIDERS,
	wireableProviders,
} from "../src/gateway-providers";

describe("gateway provider registry", () => {
	it("resolves run-catalog providers with the right gateway id + wire format", () => {
		const openai = findProviderBySlug("openai");
		expect(openai).toMatchObject({
			gatewayProviderId: "openai",
			wireFormat: "openai",
			runCatalog: true,
			billing: "unified",
		});

		const google = findProviderBySlug("google");
		expect(google).toMatchObject({
			gatewayProviderId: "google-ai-studio",
			wireFormat: "google",
			runCatalog: true,
		});
	});

	it("flags the run-path wire format per provider (anthropic stays native, google normalizes)", () => {
		// Unified billing passes Anthropic through natively even on the run path…
		expect(findProviderBySlug("anthropic")?.runWireFormat).toBe("anthropic");
		// …but normalizes google to openai-wire on the run path (so runWireFormat
		// is left to default to "openai" — i.e. not the native google wireFormat).
		expect(findProviderBySlug("google")?.runWireFormat).toBeUndefined();
		expect(findProviderBySlug("openai")?.runWireFormat).toBeUndefined();
	});

	it("maps the whole OpenAI-compatible long tail to the openai wire format + a baseURL", () => {
		for (const slug of [
			"deepseek",
			"mistral",
			"perplexity",
			"openrouter",
			"cerebras",
			"fireworks",
		]) {
			const info = findProviderBySlug(slug);
			expect(info?.wireFormat, slug).toBe("openai");
			// shared openai plugin ⇒ must carry a baseURL so the gateway-path URL
			// host-strips right
			expect(info?.baseURL, slug).toBeTruthy();
		}
	});

	it("classifies the long tail by real run-catalog membership (deepseek unified, rest BYOK)", () => {
		// deepseek/* is the one long-tail provider Cloudflare serves on the unified
		// run path (#596; env.AI.run 200 for deepseek-v4-pro) — defaults to run.
		const deepseek = findProviderBySlug("deepseek");
		expect(deepseek?.runCatalog).toBe(true);
		expect(deepseek?.billing).toBe("unified");

		// The rest are NOT on the unified run catalog — env.AI.run returns
		// 7003 model-not-found (mistral/cerebras/openrouter/fireworks) or 2021
		// use-BYOK (perplexity). They route through the BYOK gateway path.
		for (const slug of ["mistral", "perplexity", "cerebras", "openrouter", "fireworks"]) {
			const info = findProviderBySlug(slug);
			expect(info?.runCatalog, slug).toBe(false);
			expect(info?.billing, slug).toBe("byok");
		}
	});

	it("gives shared-plugin providers a baseURL whose host its transform strips", () => {
		// e.g. groq's base is api.groq.com/openai/v1 and its transform strips that
		// prefix → the gateway-native 'chat/completions'.
		const groq = findProviderBySlug("groq");
		expect(groq?.baseURL).toBe("https://api.groq.com/openai/v1");
		expect(groq?.transformEndpoint?.(`${groq.baseURL}/chat/completions`)).toBe(
			"chat/completions",
		);

		const deepseek = findProviderBySlug("deepseek");
		expect(deepseek?.transformEndpoint?.(`${deepseek.baseURL}/chat/completions`)).toBe(
			"chat/completions",
		);
	});

	it("leaves run-catalog providers on their @ai-sdk default baseURL", () => {
		for (const slug of ["openai", "anthropic", "google"]) {
			expect(findProviderBySlug(slug)?.baseURL).toBeUndefined();
		}
	});

	it("demotes providers with non-reproducible gateway-path URLs to BYOG-only", () => {
		for (const slug of ["cohere", "baseten", "parallel", "azure-openai", "google-vertex"]) {
			expect(findProviderBySlug(slug)?.wireFormat).toBeUndefined();
		}
	});

	it("honors slug aliases", () => {
		expect(findProviderBySlug("grok")?.resolverKey).toBe("xai");
		expect(findProviderBySlug("bedrock")?.resolverKey).toBe("aws-bedrock");
		expect(findProviderBySlug("azure")?.resolverKey).toBe("azure-openai");
	});

	it("returns undefined for unknown slugs", () => {
		expect(findProviderBySlug("nope")).toBeUndefined();
	});

	it("leaves provider-native (non-chat) providers without a built-in parser", () => {
		for (const slug of ["aws-bedrock", "replicate", "fal", "elevenlabs", "deepgram"]) {
			expect(findProviderBySlug(slug)?.wireFormat).toBeUndefined();
		}
	});

	it("detects providers from a request URL", () => {
		expect(
			detectProviderByUrl("https://api.openai.com/v1/chat/completions")?.gatewayProviderId,
		).toBe("openai");
		expect(
			detectProviderByUrl("https://generativelanguage.googleapis.com/v1beta/models/x")
				?.gatewayProviderId,
		).toBe("google-ai-studio");
		expect(detectProviderByUrl("https://api.x.ai/v1/chat/completions")?.gatewayProviderId).toBe(
			"grok",
		);
		expect(detectProviderByUrl("https://example.com/foo")).toBeUndefined();
	});

	it("auto-detects the full provider long tail from request URLs (BYOG parity)", () => {
		const cases: Array<[string, string]> = [
			["https://api.cohere.com/v2/chat", "cohere"],
			["https://api.cohere.ai/v1/chat", "cohere"],
			["https://api.replicate.com/v1/predictions", "replicate"],
			["https://api-inference.huggingface.co/models/gpt2", "huggingface"],
			["https://api.cartesia.ai/tts/bytes", "cartesia"],
			["https://fal.run/fal-ai/flux", "fal"],
			["https://api.ideogram.ai/generate", "ideogram"],
			["https://api.deepgram.com/v1/listen", "deepgram"],
			["https://api.elevenlabs.io/v1/text-to-speech", "elevenlabs"],
			["https://api.fireworks.ai/inference/v1/chat/completions", "fireworks"],
		];
		for (const [url, id] of cases) {
			expect(detectProviderByUrl(url)?.gatewayProviderId, url).toBe(id);
		}
	});

	it("detects + transforms Bedrock's region-scoped URL", () => {
		const url =
			"https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3/invoke";
		const info = detectProviderByUrl(url);
		expect(info?.gatewayProviderId).toBe("aws-bedrock");
		expect(info?.transformEndpoint?.(url)).toBe(
			"bedrock-runtime/us-east-1/model/anthropic.claude-3/invoke",
		);
	});

	it("covers every provider in the AI Gateway directory", () => {
		// The current developers.cloudflare.com/ai-gateway/usage/providers/ directory
		// (Workers AI is the native binding, not a gateway provider entry here).
		const directory = [
			"aws-bedrock",
			"anthropic",
			"azure-openai",
			"baseten",
			"cartesia",
			"cerebras",
			"cohere",
			"deepgram",
			"deepseek",
			"elevenlabs",
			"fal",
			"google",
			"google-vertex",
			"groq",
			"huggingface",
			"ideogram",
			"mistral",
			"openai",
			"openrouter",
			"parallel",
			"perplexity",
			"replicate",
			"xai",
		];
		for (const slug of directory) expect(findProviderBySlug(slug), slug).toBeDefined();
	});

	it("detects + transforms Azure's resource/deployment URL", () => {
		const url =
			"https://my-res.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-02-01";
		const info = detectProviderByUrl(url);
		expect(info?.gatewayProviderId).toBe("azure-openai");
		expect(info?.transformEndpoint?.(url)).toBe(
			"my-res/gpt-4o/chat/completions?api-version=2024-02-01",
		);
	});

	it("transforms (host-strips) endpoints", () => {
		const openai = findProviderBySlug("openai");
		expect(openai?.transformEndpoint?.("https://api.openai.com/v1/chat/completions")).toBe(
			"v1/chat/completions",
		);
	});

	it("lists exactly the providers Cloudflare serves on the unified run catalog", () => {
		const catalog = GATEWAY_PROVIDERS.filter((p) => p.runCatalog)
			.map((p) => p.resolverKey)
			.sort();
		// The headline directory set (openai/anthropic/google/xai/groq), the
		// run-only unified chat providers alibaba + minimax, and deepseek — the one
		// OpenAI-wire long-tail provider actually on the unified `env.AI.run` catalog
		// (#596). The rest of the long tail (mistral/perplexity/cerebras/openrouter/
		// fireworks) is BYOK gateway-path only, verified by the e2e run-path probe.
		expect(catalog).toEqual([
			"alibaba",
			"anthropic",
			"deepseek",
			"google",
			"groq",
			"minimax",
			"openai",
			"xai",
		]);
	});

	it("adds alibaba + minimax as run-only openai-wire chat providers", () => {
		for (const slug of ["alibaba", "minimax"]) {
			const info = findProviderBySlug(slug);
			expect(info, slug).toMatchObject({
				runCatalog: true,
				wireFormat: "openai",
				billing: "unified",
				// run-path only: not a native gateway provider, so no gateway path
				gatewayPath: false,
			});
			// run-path emits openai-wire (default) — no native runWireFormat override
			expect(info?.runWireFormat, slug).toBeUndefined();
			// run-only: not in the native gateway directory, so no BYOG URL detection
			expect(info?.hostPattern, slug).toBeUndefined();
		}
	});

	it("exposes only parseable providers as wireable", () => {
		for (const p of wireableProviders()) expect(p.wireFormat).toBeDefined();
		expect(wireableProviders().length).toBeLessThan(GATEWAY_PROVIDERS.length);
	});
});
