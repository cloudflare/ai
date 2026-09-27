import { describe, expect, it } from "vitest";
import { providers } from "../src/providers";

const testCases = [
	{
		expected: "v1/chat/completions",
		name: "openai",
		url: "https://api.openai.com/v1/chat/completions",
	},
	{
		expected: "v1/chat/completions",
		name: "deepseek",
		url: "https://api.deepseek.com/v1/chat/completions",
	},
	{
		expected: "v1/messages",
		name: "anthropic",
		url: "https://api.anthropic.com/v1/messages",
	},
	{
		expected: "v1beta/models",
		name: "google-ai-studio",
		url: "https://generativelanguage.googleapis.com/v1beta/models",
	},
	{
		expected: "v1/chat",
		name: "grok",
		url: "https://api.x.ai/v1/chat",
	},
	{
		expected: "v1/chat/completions",
		name: "mistral",
		url: "https://api.mistral.ai/v1/chat/completions",
	},
	{
		expected: "v1/chat/completions",
		name: "perplexity-ai",
		url: "https://api.perplexity.ai/v1/chat/completions",
	},
	{
		expected: "v1/predictions",
		name: "replicate",
		url: "https://api.replicate.com/v1/predictions",
	},
	{
		expected: "chat/completions",
		name: "groq",
		url: "https://api.groq.com/openai/v1/chat/completions",
	},
	{
		expected: "myresource/mydeployment/chat/completions?api-version=2024-02-15-preview",
		name: "azure-openai",
		url: "https://myresource.openai.azure.com/openai/deployments/mydeployment/chat/completions?api-version=2024-02-15-preview",
	},
	{
		expected: "myresource/openai/responses?api-version=2024-02-15-preview",
		name: "azure-openai",
		url: "https://myresource.openai.azure.com/openai/v1/responses?api-version=2024-02-15-preview",
	},
	{
		expected: "v1/chat/completions",
		name: "openrouter",
		url: "https://openrouter.ai/api/v1/chat/completions",
	},
	{
		expected: "chat/completions",
		name: "compat",
		url: "https://gateway.ai.cloudflare.com/v1/compat/chat/completions",
	},
];

describe("ProvidersConfigs endpoint parsing", () => {
	for (const testCase of testCases) {
		it(`should correctly parse endpoint for provider "${testCase.name}"`, () => {
			const provider = providers.find((p) => p.name === testCase.name);
			expect(provider).toBeDefined();
			const result = provider!.transformEndpoint(testCase.url);
			expect(result).toBe(testCase.expected);
		});
	}

	// Azure's v1 surface is only routable for the Responses API (the sole path
	// with a non-deployment Azure route); other v1 paths must stay unmatched
	// rather than route to an endpoint that 404s at Azure.
	it("does not match Azure v1 paths other than responses", () => {
		const url =
			"https://myresource.openai.azure.com/openai/v1/chat/completions?api-version=2024-02-15-preview";
		expect(providers.find((p) => p.regex.test(url))).toBeUndefined();
	});
});

describe("Provider auth header selection", () => {
	// Providers whose native BYOK header is `authorization` omit `headerKey`
	// (index.ts defaults to stripping `authorization`); others carry it.
	const expectations: { name: string; headerKey: string | undefined }[] = [
		{ name: "openai", headerKey: undefined },
		{ name: "anthropic", headerKey: "x-api-key" },
		{ name: "google-ai-studio", headerKey: "x-goog-api-key" },
		{ name: "azure-openai", headerKey: "api-key" },
	];

	for (const { name, headerKey } of expectations) {
		it(`exposes the expected headerKey for "${name}"`, () => {
			const provider = providers.find((p) => p.name === name);
			expect(provider).toBeDefined();
			expect(provider!.headerKey).toBe(headerKey);
		});
	}

	it("includes the local compat entry that has no core registry equivalent", () => {
		expect(providers.find((p) => p.name === "compat")).toBeDefined();
	});
});
