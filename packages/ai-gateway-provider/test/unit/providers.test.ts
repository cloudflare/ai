import { describe, expect, it } from "vitest";
import { providers } from "../../src/providers";

const testCases = [
	{
		name: "openai",
		url: "https://api.openai.com/v1/chat/completions",
		expected: "v1/chat/completions",
	},
	{
		name: "deepseek",
		url: "https://api.deepseek.com/v1/chat/completions",
		expected: "v1/chat/completions",
	},
	{
		name: "anthropic",
		url: "https://api.anthropic.com/v1/messages",
		expected: "v1/messages",
	},
	{
		name: "google-ai-studio",
		url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
		expected: "v1beta/models/gemini-pro:generateContent",
	},
	{
		name: "grok",
		url: "https://api.x.ai/v1/chat/completions",
		expected: "v1/chat/completions",
	},
	{
		name: "mistral",
		url: "https://api.mistral.ai/v1/chat/completions",
		expected: "v1/chat/completions",
	},
	{
		name: "perplexity-ai",
		url: "https://api.perplexity.ai/v1/chat/completions",
		expected: "v1/chat/completions",
	},
	{
		name: "replicate",
		url: "https://api.replicate.com/v1/predictions",
		expected: "v1/predictions",
	},
	{
		name: "groq",
		url: "https://api.groq.com/openai/v1/chat/completions",
		expected: "chat/completions",
	},
	{
		name: "azure-openai",
		url: "https://myresource.openai.azure.com/openai/deployments/mydeployment/chat/completions?api-version=2024-02-15-preview",
		expected: "myresource/mydeployment/chat/completions?api-version=2024-02-15-preview",
	},
	{
		name: "openrouter",
		url: "https://openrouter.ai/api/v1/chat/completions",
		expected: "v1/chat/completions",
	},
	{
		name: "aws-bedrock",
		url: "https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.titan-embed-text-v1/invoke",
		expected: "bedrock-runtime/us-east-1/model/amazon.titan-embed-text-v1/invoke",
	},
	{
		name: "aws-bedrock",
		url: "https://bedrock-runtime.eu-west-1.amazonaws.com/model/anthropic.claude-v2/invoke",
		expected: "bedrock-runtime/eu-west-1/model/anthropic.claude-v2/invoke",
	},
	{
		name: "cerebras",
		url: "https://api.cerebras.ai/v1/chat/completions",
		expected: "chat/completions",
	},
	{
		name: "cohere",
		url: "https://api.cohere.com/v2/chat",
		expected: "v2/chat",
	},
	{
		name: "cohere",
		url: "https://api.cohere.ai/v1/chat",
		expected: "v1/chat",
	},
	{
		name: "deepgram",
		url: "https://api.deepgram.com/v1/listen",
		expected: "v1/listen",
	},
	{
		name: "elevenlabs",
		url: "https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb",
		expected: "v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb",
	},
	{
		name: "fireworks",
		url: "https://api.fireworks.ai/inference/v1/chat/completions",
		expected: "chat/completions",
	},
	{
		name: "huggingface",
		url: "https://api-inference.huggingface.co/models/bigcode/starcoder",
		expected: "bigcode/starcoder",
	},
	{
		name: "cartesia",
		url: "https://api.cartesia.ai/v1/tts/bytes",
		expected: "v1/tts/bytes",
	},
	{
		name: "fal",
		url: "https://fal.run/fal-ai/fast-sdxl",
		expected: "fal-ai/fast-sdxl",
	},
	{
		name: "ideogram",
		url: "https://api.ideogram.ai/generate",
		expected: "generate",
	},
	{
		name: "compat",
		url: "https://gateway.ai.cloudflare.com/v1/compat/chat/completions",
		expected: "chat/completions",
	},
];

describe("Provider URL matching and endpoint transformation", () => {
	for (const testCase of testCases) {
		it(`should match and transform "${testCase.name}" — ${testCase.url}`, () => {
			const provider = providers.find(
				(p) => p.name === testCase.name && p.regex.test(testCase.url),
			);
			expect(provider).toBeDefined();
			expect(provider!.transformEndpoint(testCase.url)).toBe(testCase.expected);
		});
	}

	it("should not match unrecognized URLs", () => {
		const url = "https://some-random-api.example.com/v1/chat";
		const matched = providers.some((p) => p.regex.test(url));
		expect(matched).toBe(false);
	});

	it("should match Google Vertex AI with region prefix", () => {
		const vertexUrl =
			"https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-pro:generateContent";
		const matched = providers.filter((p) => p.regex.test(vertexUrl));
		expect(matched).toHaveLength(1);
		expect(matched[0]!.name).toBe("google-vertex-ai");
	});

	it("should not match URLs that merely contain aiplatform.googleapis.com as a substring", () => {
		const spoofUrl = "https://evil.com/aiplatform.googleapis.com/v1/models";
		const matched = providers.some((p) => p.regex.test(spoofUrl));
		expect(matched).toBe(false);
	});
});
