import { describe, it, expect } from "vitest";
import { providers } from "../src/providers";

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
        url: "https://generativelanguage.googleapis.com/v1beta/models",
        expected: "v1beta/models",
    },
    {
        name: "grok",
        url: "https://api.x.ai/v1/chat",
        expected: "v1/chat",
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
