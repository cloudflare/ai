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
		expected: "bedrock-runtime/us-east-1/model/anthropic.claude-sonnet-4-5-20250929-v1:0/invoke",
		name: "aws-bedrock",
		url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-sonnet-4-5-20250929-v1:0/invoke",
	},
	{
		expected: "bedrock-runtime/us-east-1/model/anthropic.claude-sonnet-4-5-20250929-v1%3A0/converse",
		name: "aws-bedrock",
		url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-sonnet-4-5-20250929-v1%3A0/converse",
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
});
