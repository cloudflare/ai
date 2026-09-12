import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import type {
	AiGatewayBindingConfig,
	AiGatewayCredentialsConfig,
} from "../src/utils/create-fetcher";
import type { GeminiGatewayConfig } from "../src";

// ---------------------------------------------------------------------------
// Mock upstream adapter classes — capture constructor args for assertions.
// ---------------------------------------------------------------------------

const mockAnthropicTextCtor = vi.fn();
const mockAnthropicSummarizeCtor = vi.fn();

vi.mock("@tanstack/ai-anthropic", () => ({
	AnthropicTextAdapter: class {
		constructor(...args: unknown[]) {
			mockAnthropicTextCtor(...args);
		}
	},
	createAnthropicSummarize: (...args: unknown[]) => {
		mockAnthropicSummarizeCtor(...args);
		return {};
	},
	ANTHROPIC_MODELS: ["claude-sonnet-4-5"],
}));

const mockGeminiTextCtor = vi.fn();
const mockGeminiImageCtor = vi.fn();
const mockGeminiSummarizeCtor = vi.fn();
const mockGeminiTTSCtor = vi.fn();

vi.mock("@tanstack/ai-gemini", () => ({
	GeminiTextAdapter: class {
		constructor(...args: unknown[]) {
			mockGeminiTextCtor(...args);
		}
	},
	GeminiImageAdapter: class {
		constructor(...args: unknown[]) {
			mockGeminiImageCtor(...args);
		}
	},
	createGeminiSummarize: (...args: unknown[]) => {
		mockGeminiSummarizeCtor(...args);
		return {};
	},
	GeminiTTSAdapter: class {
		constructor(...args: unknown[]) {
			mockGeminiTTSCtor(...args);
		}
	},
	GeminiTextModels: ["gemini-2.5-flash"],
	GeminiImageModels: ["imagen-4.0-generate-001"],
	GeminiSummarizeModels: ["gemini-2.0-flash"],
	GeminiTTSModels: ["gemini-2.5-flash-preview-tts"],
}));

const mockGrokTextCtor = vi.fn();
const mockGrokImageCtor = vi.fn();
const mockGrokSummarizeCtor = vi.fn();

vi.mock("@tanstack/ai-grok", () => ({
	GrokTextAdapter: class {
		constructor(...args: unknown[]) {
			mockGrokTextCtor(...args);
		}
	},
	GrokImageAdapter: class {
		constructor(...args: unknown[]) {
			mockGrokImageCtor(...args);
		}
	},
	createGrokSummarize: (...args: unknown[]) => {
		mockGrokSummarizeCtor(...args);
		return {};
	},
	GROK_CHAT_MODELS: ["grok-3"],
	GROK_IMAGE_MODELS: ["grok-2-image-1212"],
}));

const mockOpenAITextCtor = vi.fn();
const mockOpenAISummarizeCtor = vi.fn();
const mockOpenAIImageCtor = vi.fn();
const mockOpenAITranscriptionCtor = vi.fn();
const mockOpenAITTSCtor = vi.fn();
const mockOpenAIVideoCtor = vi.fn();

vi.mock("@tanstack/ai-openai", () => ({
	OpenAITextAdapter: class {
		constructor(...args: unknown[]) {
			mockOpenAITextCtor(...args);
		}
	},
	createOpenaiSummarize: (...args: unknown[]) => {
		mockOpenAISummarizeCtor(...args);
		return {};
	},
	OpenAIImageAdapter: class {
		constructor(...args: unknown[]) {
			mockOpenAIImageCtor(...args);
		}
	},
	OpenAITranscriptionAdapter: class {
		constructor(...args: unknown[]) {
			mockOpenAITranscriptionCtor(...args);
		}
	},
	OpenAITTSAdapter: class {
		constructor(...args: unknown[]) {
			mockOpenAITTSCtor(...args);
		}
	},
	OpenAIVideoAdapter: class {
		constructor(...args: unknown[]) {
			mockOpenAIVideoCtor(...args);
		}
	},
	OPENAI_CHAT_MODELS: ["gpt-4o"],
	OPENAI_IMAGE_MODELS: ["dall-e-3"],
	OPENAI_TRANSCRIPTION_MODELS: ["whisper-1"],
	OPENAI_TTS_MODELS: ["tts-1"],
	OPENAI_VIDEO_MODELS: ["sora"],
}));

vi.mock("@tanstack/ai", () => ({}));
const mockOpenRouterTextCtor = vi.fn();
const mockOpenRouterImageCtor = vi.fn();
const mockOpenRouterSummarizeCtor = vi.fn();

vi.mock("@tanstack/ai-openrouter", () => ({
	OpenRouterTextAdapter: class {
		constructor(...args: unknown[]) {
			mockOpenRouterTextCtor(...args);
		}
	},
	OpenRouterImageAdapter: class {
		constructor(...args: unknown[]) {
			mockOpenRouterImageCtor(...args);
		}
	},
	createOpenRouterSummarize: (...args: unknown[]) => {
		mockOpenRouterSummarizeCtor(...args);
		return {};
	},
}));

vi.mock("@openrouter/sdk", () => ({
	HTTPClient: class {
		fetcher: unknown;
		constructor(opts: { fetcher?: unknown }) {
			this.fetcher = opts?.fetcher;
		}
	},
}));

vi.mock("openai", () => ({ default: class {} }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {} }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const credentialsConfig: AiGatewayCredentialsConfig = {
	accountId: "test-account",
	gatewayId: "test-gateway",
	apiKey: "test-api-key",
};

const geminiConfig: GeminiGatewayConfig = {
	accountId: "test-account",
	gatewayId: "test-gateway",
	apiKey: "test-api-key",
};

const geminiConfigWithCfKey: GeminiGatewayConfig = {
	accountId: "test-account",
	gatewayId: "test-gateway",
	apiKey: "test-api-key",
	cfApiKey: "cf-test-key",
};

const mockBindingRun = vi.fn(async (..._args: unknown[]) => new Response("ok"));
const bindingConfig: AiGatewayBindingConfig = {
	binding: { run: mockBindingRun },
	apiKey: "binding-api-key",
};

function assertFetchInjected(ctor: Mock, expectedApiKey: string) {
	expect(ctor).toHaveBeenCalledOnce();
	const [config] = ctor.mock.calls[0]!;
	expect(config.apiKey).toBe(expectedApiKey);
	expect(typeof config.fetch).toBe("function");
	return config;
}

function assertGeminiConfig(ctor: Mock, expectedApiKey: string) {
	expect(ctor).toHaveBeenCalledOnce();
	const [config] = ctor.mock.calls[0]!;
	expect(config.apiKey).toBe(expectedApiKey);
	expect(config.httpOptions).toBeDefined();
	expect(config.httpOptions.baseUrl).toContain("gateway.ai.cloudflare.com");
	expect(config.httpOptions.baseUrl).toContain("google-ai-studio");
	return config;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Anthropic gateway adapters", () => {
	beforeEach(() => vi.clearAllMocks());

	it("createAnthropicChat with credentials config", async () => {
		const { createAnthropicChat } = await import("../src/adapters/anthropic");
		createAnthropicChat("claude-sonnet-4-5" as any, credentialsConfig);

		assertFetchInjected(mockAnthropicTextCtor, "test-api-key");
		// model is second arg
		expect(mockAnthropicTextCtor.mock.calls[0]![1]).toBe("claude-sonnet-4-5");
	});

	it("createAnthropicChat with binding config", async () => {
		const { createAnthropicChat } = await import("../src/adapters/anthropic");
		createAnthropicChat("claude-sonnet-4-5" as any, bindingConfig);

		const config = assertFetchInjected(mockAnthropicTextCtor, "binding-api-key");
		// Invoke the fetch — should call binding.run
		await config.fetch("https://api.anthropic.com/v1/messages", {
			body: JSON.stringify({ model: "claude-sonnet-4-5", messages: [] }),
		});
		expect(mockBindingRun).toHaveBeenCalledOnce();
	});

	it("createAnthropicChat defaults apiKey to 'unused'", async () => {
		const { createAnthropicChat } = await import("../src/adapters/anthropic");
		const noKeyConfig = { ...credentialsConfig, apiKey: undefined };
		createAnthropicChat("claude-sonnet-4-5" as any, noKeyConfig as any);

		const [config] = mockAnthropicTextCtor.mock.calls[0]!;
		expect(config.apiKey).toBe("unused");
	});

	it("createAnthropicSummarize with credentials config", async () => {
		const { createAnthropicSummarize } = await import("../src/adapters/anthropic");
		createAnthropicSummarize("claude-sonnet-4-5" as any, credentialsConfig);

		expect(mockAnthropicSummarizeCtor).toHaveBeenCalledOnce();
		const [model, apiKey, cfg] = mockAnthropicSummarizeCtor.mock.calls[0]!;
		expect(model).toBe("claude-sonnet-4-5");
		expect(apiKey).toBe("test-api-key");
		expect(typeof cfg.fetch).toBe("function");
	});
});

describe("Gemini gateway adapters", () => {
	beforeEach(() => vi.clearAllMocks());

	it("createGeminiChat with credentials config", async () => {
		const { createGeminiChat } = await import("../src/adapters/gemini");
		createGeminiChat("gemini-2.5-flash" as any, geminiConfig);

		const config = assertGeminiConfig(mockGeminiTextCtor, "test-api-key");
		expect(config.httpOptions.baseUrl).toBe(
			"https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/google-ai-studio",
		);
		expect(mockGeminiTextCtor.mock.calls[0]![1]).toBe("gemini-2.5-flash");
	});

	it("createGeminiChat includes cf-aig-authorization header when cfApiKey provided", async () => {
		const { createGeminiChat } = await import("../src/adapters/gemini");
		createGeminiChat("gemini-2.5-flash" as any, geminiConfigWithCfKey);

		const [config] = mockGeminiTextCtor.mock.calls[0]!;
		expect(config.httpOptions.headers).toEqual({
			"cf-aig-authorization": "Bearer cf-test-key",
		});
	});

	it("createGeminiChat omits headers when no cfApiKey or cache options", async () => {
		const { createGeminiChat } = await import("../src/adapters/gemini");
		createGeminiChat("gemini-2.5-flash" as any, geminiConfig);

		const [config] = mockGeminiTextCtor.mock.calls[0]!;
		expect(config.httpOptions.headers).toBeUndefined();
	});

	it("createGeminiChat passes cache headers via httpOptions.headers", async () => {
		const { createGeminiChat } = await import("../src/adapters/gemini");
		const configWithCache: GeminiGatewayConfig = {
			...geminiConfig,
			skipCache: true,
			cacheTtl: 300,
			customCacheKey: "my-key",
			metadata: { env: "test" },
		};
		createGeminiChat("gemini-2.5-flash" as any, configWithCache);

		const [config] = mockGeminiTextCtor.mock.calls[0]!;
		expect(config.httpOptions.headers["cf-aig-skip-cache"]).toBe("true");
		expect(config.httpOptions.headers["cf-aig-cache-ttl"]).toBe("300");
		expect(config.httpOptions.headers["cf-aig-cache-key"]).toBe("my-key");
		expect(config.httpOptions.headers["cf-aig-metadata"]).toBe(JSON.stringify({ env: "test" }));
	});

	it("createGeminiChat passes byokAlias via httpOptions.headers", async () => {
		const { createGeminiChat } = await import("../src/adapters/gemini");
		const configWithAlias: GeminiGatewayConfig = {
			...geminiConfig,
			byokAlias: "development",
		};
		createGeminiChat("gemini-2.5-flash" as any, configWithAlias);

		const [config] = mockGeminiTextCtor.mock.calls[0]!;
		expect(config.httpOptions.headers["cf-aig-byok-alias"]).toBe("development");
	});

	it("createGeminiImage with credentials config", async () => {
		const { createGeminiImage } = await import("../src/adapters/gemini");
		createGeminiImage("imagen-4.0-generate-001" as any, geminiConfig);

		assertGeminiConfig(mockGeminiImageCtor, "test-api-key");
		expect(mockGeminiImageCtor.mock.calls[0]![1]).toBe("imagen-4.0-generate-001");
	});

	it("createGeminiSummarize with credentials config", async () => {
		const { createGeminiSummarize } = await import("../src/adapters/gemini");
		createGeminiSummarize("gemini-2.0-flash" as any, geminiConfig);

		expect(mockGeminiSummarizeCtor).toHaveBeenCalledOnce();
		const [apiKey, model, cfg] = mockGeminiSummarizeCtor.mock.calls[0]!;
		expect(apiKey).toBe("test-api-key");
		expect(model).toBe("gemini-2.0-flash");
		expect(cfg.httpOptions.baseUrl).toContain("google-ai-studio");
	});

	it("createGeminiTts with credentials config", async () => {
		const { createGeminiTts } = await import("../src/adapters/gemini");
		createGeminiTts("gemini-2.5-flash-preview-tts" as any, geminiConfig);

		assertGeminiConfig(mockGeminiTTSCtor, "test-api-key");
		expect(mockGeminiTTSCtor.mock.calls[0]![1]).toBe("gemini-2.5-flash-preview-tts");
	});

	it("createGeminiChat throws on binding config (runtime guard)", async () => {
		const { createGeminiChat } = await import("../src/adapters/gemini");
		const bindingStyleConfig = {
			binding: { run: async () => new Response("ok") },
		};
		expect(() =>
			createGeminiChat("gemini-2.5-flash" as any, bindingStyleConfig as any),
		).toThrow(/Gemini adapters do not support binding config/);
	});

	it("createGeminiImage throws on binding config (runtime guard)", async () => {
		const { createGeminiImage } = await import("../src/adapters/gemini");
		const bindingStyleConfig = {
			binding: { run: async () => new Response("ok") },
		};
		expect(() =>
			createGeminiImage("imagen-4.0-generate-001" as any, bindingStyleConfig as any),
		).toThrow(/Gemini adapters do not support binding config/);
	});

	it("createGeminiTts throws on binding config (runtime guard)", async () => {
		const { createGeminiTts } = await import("../src/adapters/gemini");
		const bindingStyleConfig = {
			binding: { run: async () => new Response("ok") },
		};
		expect(() =>
			createGeminiTts("gemini-2.5-flash-preview-tts" as any, bindingStyleConfig as any),
		).toThrow(/googleapis\/js-genai/);
	});
});

describe("Grok gateway adapters", () => {
	beforeEach(() => vi.clearAllMocks());

	it("createGrokChat with credentials config", async () => {
		const { createGrokChat } = await import("../src/adapters/grok");
		createGrokChat("grok-3" as any, credentialsConfig);

		assertFetchInjected(mockGrokTextCtor, "test-api-key");
		expect(mockGrokTextCtor.mock.calls[0]![1]).toBe("grok-3");
	});

	it("createGrokChat with binding config", async () => {
		const { createGrokChat } = await import("../src/adapters/grok");
		createGrokChat("grok-3" as any, bindingConfig);

		const config = assertFetchInjected(mockGrokTextCtor, "binding-api-key");
		await config.fetch("https://api.x.ai/v1/chat/completions", {
			body: JSON.stringify({ model: "grok-3", messages: [] }),
		});
		expect(mockBindingRun).toHaveBeenCalledOnce();
	});

	it("createGrokImage with credentials config", async () => {
		const { createGrokImage } = await import("../src/adapters/grok");
		createGrokImage("grok-2-image-1212" as any, credentialsConfig);

		assertFetchInjected(mockGrokImageCtor, "test-api-key");
		expect(mockGrokImageCtor.mock.calls[0]![1]).toBe("grok-2-image-1212");
	});

	it("createGrokSummarize with credentials config", async () => {
		const { createGrokSummarize } = await import("../src/adapters/grok");
		createGrokSummarize("grok-3" as any, credentialsConfig);

		expect(mockGrokSummarizeCtor).toHaveBeenCalledOnce();
		const [model, apiKey, cfg] = mockGrokSummarizeCtor.mock.calls[0]!;
		expect(model).toBe("grok-3");
		expect(apiKey).toBe("test-api-key");
		expect(typeof cfg.fetch).toBe("function");
	});

	it("createGrokChat defaults apiKey to 'unused'", async () => {
		const { createGrokChat } = await import("../src/adapters/grok");
		const noKeyConfig = { ...credentialsConfig, apiKey: undefined };
		createGrokChat("grok-3" as any, noKeyConfig as any);

		const [config] = mockGrokTextCtor.mock.calls[0]!;
		expect(config.apiKey).toBe("unused");
	});
});

describe("OpenAI gateway adapters", () => {
	beforeEach(() => vi.clearAllMocks());

	it("createOpenAiChat with credentials config", async () => {
		const { createOpenAiChat } = await import("../src/adapters/openai");
		createOpenAiChat("gpt-4o" as any, credentialsConfig);

		assertFetchInjected(mockOpenAITextCtor, "test-api-key");
		expect(mockOpenAITextCtor.mock.calls[0]![1]).toBe("gpt-4o");
	});

	it("createOpenAiChat with binding config", async () => {
		const { createOpenAiChat } = await import("../src/adapters/openai");
		createOpenAiChat("gpt-4o" as any, bindingConfig);

		const config = assertFetchInjected(mockOpenAITextCtor, "binding-api-key");
		await config.fetch("https://api.openai.com/v1/chat/completions", {
			body: JSON.stringify({ model: "gpt-4o", messages: [] }),
		});
		expect(mockBindingRun).toHaveBeenCalledOnce();
	});

	it("createOpenAiSummarize with credentials config", async () => {
		const { createOpenAiSummarize } = await import("../src/adapters/openai");
		createOpenAiSummarize("gpt-4o" as any, credentialsConfig);

		expect(mockOpenAISummarizeCtor).toHaveBeenCalledOnce();
		const [model, apiKey, cfg] = mockOpenAISummarizeCtor.mock.calls[0]!;
		expect(model).toBe("gpt-4o");
		expect(apiKey).toBe("test-api-key");
		expect(typeof cfg.fetch).toBe("function");
	});

	it("createOpenAiImage with credentials config", async () => {
		const { createOpenAiImage } = await import("../src/adapters/openai");
		createOpenAiImage("dall-e-3" as any, credentialsConfig);

		assertFetchInjected(mockOpenAIImageCtor, "test-api-key");
		expect(mockOpenAIImageCtor.mock.calls[0]![1]).toBe("dall-e-3");
	});

	it("createOpenAiTranscription with credentials config", async () => {
		const { createOpenAiTranscription } = await import("../src/adapters/openai");
		createOpenAiTranscription("whisper-1" as any, credentialsConfig);

		assertFetchInjected(mockOpenAITranscriptionCtor, "test-api-key");
		expect(mockOpenAITranscriptionCtor.mock.calls[0]![1]).toBe("whisper-1");
	});

	it("createOpenAiTts with credentials config", async () => {
		const { createOpenAiTts } = await import("../src/adapters/openai");
		createOpenAiTts("tts-1" as any, credentialsConfig);

		assertFetchInjected(mockOpenAITTSCtor, "test-api-key");
		expect(mockOpenAITTSCtor.mock.calls[0]![1]).toBe("tts-1");
	});

	it("createOpenAiVideo with credentials config", async () => {
		const { createOpenAiVideo } = await import("../src/adapters/openai");
		createOpenAiVideo("sora" as any, credentialsConfig);

		assertFetchInjected(mockOpenAIVideoCtor, "test-api-key");
		expect(mockOpenAIVideoCtor.mock.calls[0]![1]).toBe("sora");
	});

	it("createOpenAiChat defaults apiKey to 'unused'", async () => {
		const { createOpenAiChat } = await import("../src/adapters/openai");
		const noKeyConfig = { ...credentialsConfig, apiKey: undefined };
		createOpenAiChat("gpt-4o" as any, noKeyConfig as any);

		const [config] = mockOpenAITextCtor.mock.calls[0]!;
		expect(config.apiKey).toBe("unused");
	});
});

describe("OpenRouter gateway adapters", () => {
	beforeEach(() => vi.clearAllMocks());

	it("createOpenRouterChat with credentials config", async () => {
		const { createOpenRouterChat } = await import("../src/adapters/openrouter");
		createOpenRouterChat("openai/gpt-4o", credentialsConfig);

		expect(mockOpenRouterTextCtor).toHaveBeenCalledOnce();
		const [config] = mockOpenRouterTextCtor.mock.calls[0]!;
		expect(config.apiKey).toBe("test-api-key");
		expect(config.httpClient).toBeDefined();
		expect(mockOpenRouterTextCtor.mock.calls[0]![1]).toBe("openai/gpt-4o");
	});

	it("createOpenRouterChat with binding config", async () => {
		const { createOpenRouterChat } = await import("../src/adapters/openrouter");
		createOpenRouterChat("openai/gpt-4o", bindingConfig);

		expect(mockOpenRouterTextCtor).toHaveBeenCalledOnce();
		const [config] = mockOpenRouterTextCtor.mock.calls[0]!;
		expect(config.apiKey).toBe("binding-api-key");
		expect(config.httpClient).toBeDefined();
	});

	it("createOpenRouterImage with credentials config", async () => {
		const { createOpenRouterImage } = await import("../src/adapters/openrouter");
		createOpenRouterImage("openai/dall-e-3", credentialsConfig);

		expect(mockOpenRouterImageCtor).toHaveBeenCalledOnce();
		const [config] = mockOpenRouterImageCtor.mock.calls[0]!;
		expect(config.apiKey).toBe("test-api-key");
		expect(config.httpClient).toBeDefined();
		expect(mockOpenRouterImageCtor.mock.calls[0]![1]).toBe("openai/dall-e-3");
	});

	it("createOpenRouterSummarize with credentials config", async () => {
		const { createOpenRouterSummarize } = await import("../src/adapters/openrouter");
		createOpenRouterSummarize("openai/gpt-4o", credentialsConfig);

		expect(mockOpenRouterSummarizeCtor).toHaveBeenCalledOnce();
		const [model, apiKey, cfg] = mockOpenRouterSummarizeCtor.mock.calls[0]!;
		expect(model).toBe("openai/gpt-4o");
		expect(apiKey).toBe("test-api-key");
		expect(cfg.httpClient).toBeDefined();
	});

	it("createOpenRouterChat defaults apiKey to 'unused'", async () => {
		const { createOpenRouterChat } = await import("../src/adapters/openrouter");
		const noKeyConfig = { ...credentialsConfig, apiKey: undefined };
		createOpenRouterChat("openai/gpt-4o", noKeyConfig as any);

		const [config] = mockOpenRouterTextCtor.mock.calls[0]!;
		expect(config.apiKey).toBe("unused");
	});

	it("createOpenRouterChat forwards byokAlias through the HTTPClient fetcher", async () => {
		const originalFetch = globalThis.fetch;
		const mockFetch = vi.fn(async (..._args: unknown[]) => new Response("ok"));
		globalThis.fetch = mockFetch as any;

		try {
			const { createOpenRouterChat } = await import("../src/adapters/openrouter");
			createOpenRouterChat("openai/gpt-4o", {
				...credentialsConfig,
				byokAlias: "development",
			});

			const [config] = mockOpenRouterTextCtor.mock.calls[0]!;
			await config.httpClient.fetcher("https://openrouter.ai/api/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({ model: "openai/gpt-4o", messages: [] }),
			});

			const [, init] = mockFetch.mock.calls[0]!;
			expect((init as any).headers["cf-aig-byok-alias"]).toBe("development");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

describe("gateway fetch integration", () => {
	beforeEach(() => vi.clearAllMocks());

	it("credentials config produces fetch that calls global fetch with gateway URL", async () => {
		const originalFetch = globalThis.fetch;
		const mockFetch = vi.fn(async (..._args: unknown[]) => new Response("ok"));
		globalThis.fetch = mockFetch as any;

		try {
			const { createOpenAiChat } = await import("../src/adapters/openai");
			createOpenAiChat("gpt-4o" as any, credentialsConfig);

			const [config] = mockOpenAITextCtor.mock.calls[0]!;
			await config.fetch("https://api.openai.com/v1/chat/completions", {
				body: JSON.stringify({ model: "gpt-4o", messages: [] }),
			});

			expect(mockFetch).toHaveBeenCalledOnce();
			const [url] = mockFetch.mock.calls[0]!;
			expect(url).toBe("https://gateway.ai.cloudflare.com/v1/test-account/test-gateway");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("createOpenAiChat and createAnthropicChat forward byokAlias on REST", async () => {
		const originalFetch = globalThis.fetch;
		const mockFetch = vi.fn(async (..._args: unknown[]) => new Response("ok"));
		globalThis.fetch = mockFetch as any;

		try {
			const { createOpenAiChat } = await import("../src/adapters/openai");
			const { createAnthropicChat } = await import("../src/adapters/anthropic");
			const withAlias = { ...credentialsConfig, byokAlias: "development" };

			createOpenAiChat("gpt-4o" as any, withAlias);
			await mockOpenAITextCtor.mock.calls[0]![0].fetch(
				"https://api.openai.com/v1/chat/completions",
				{ body: JSON.stringify({ model: "gpt-4o", messages: [] }) },
			);

			createAnthropicChat("claude-sonnet-4-5" as any, withAlias);
			await mockAnthropicTextCtor.mock.calls[0]![0].fetch(
				"https://api.anthropic.com/v1/messages",
				{ body: JSON.stringify({ model: "claude-sonnet-4-5", messages: [] }) },
			);

			expect(mockFetch).toHaveBeenCalledTimes(2);
			for (const [, init] of mockFetch.mock.calls) {
				expect((init as any).headers["cf-aig-byok-alias"]).toBe("development");
			}
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("binding config produces fetch that calls binding.run", async () => {
		const { createAnthropicChat } = await import("../src/adapters/anthropic");
		createAnthropicChat("claude-sonnet-4-5" as any, bindingConfig);

		const [config] = mockAnthropicTextCtor.mock.calls[0]!;
		await config.fetch("https://api.anthropic.com/v1/messages", {
			body: JSON.stringify({ model: "claude-sonnet-4-5", messages: [] }),
		});

		expect(mockBindingRun).toHaveBeenCalledOnce();
		const requestPayload = mockBindingRun.mock.calls[0]![0] as Record<string, any>;
		expect(requestPayload.provider).toBe("anthropic");
		expect(requestPayload.headers).toBeDefined();
		expect(requestPayload.headers["authorization"]).toBe("Bearer binding-api-key");
	});

	it("cache headers are passed through when config has caching options", async () => {
		const originalFetch = globalThis.fetch;
		const mockFetch = vi.fn(async (..._args: unknown[]) => new Response("ok"));
		globalThis.fetch = mockFetch as any;

		try {
			const { createGrokChat } = await import("../src/adapters/grok");
			createGrokChat("grok-3" as any, {
				...credentialsConfig,
				skipCache: true,
				cacheTtl: 300,
				customCacheKey: "my-key",
				metadata: { env: "test" },
				byokAlias: "development",
			});

			const [config] = mockGrokTextCtor.mock.calls[0]!;
			await config.fetch("https://api.x.ai/v1/chat/completions", {
				body: JSON.stringify({ model: "grok-3", messages: [] }),
			});

			expect(mockFetch).toHaveBeenCalledOnce();
			const [, init] = mockFetch.mock.calls[0]!;
			const body = JSON.parse((init as any).body);
			expect(body.headers["cf-aig-skip-cache"]).toBe("true");
			expect(body.headers["cf-aig-cache-ttl"]).toBe("300");
			expect(body.headers["cf-aig-cache-key"]).toBe("my-key");
			expect(body.headers["cf-aig-metadata"]).toBe(JSON.stringify({ env: "test" }));
			expect(body.headers["cf-aig-byok-alias"]).toBe("development");
			expect((init as any).headers["cf-aig-byok-alias"]).toBe("development");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
