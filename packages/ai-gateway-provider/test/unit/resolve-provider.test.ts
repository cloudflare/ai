import { describe, expect, it } from "vitest";
import { resolveProvider } from "../../src";

describe("resolveProvider", () => {
	describe("without explicit providerName", () => {
		it("should match a known OpenAI URL", () => {
			const result = resolveProvider("https://api.openai.com/v1/responses");
			expect(result.name).toBe("openai");
			expect(result.endpoint).toBe("v1/responses");
		});

		it("should match a known Anthropic URL", () => {
			const result = resolveProvider("https://api.anthropic.com/v1/messages");
			expect(result.name).toBe("anthropic");
			expect(result.endpoint).toBe("v1/messages");
		});

		it("should match a known Groq URL", () => {
			const result = resolveProvider("https://api.groq.com/openai/v1/chat/completions");
			expect(result.name).toBe("groq");
			expect(result.endpoint).toBe("chat/completions");
		});

		it("should throw for an unrecognized URL", () => {
			expect(() => resolveProvider("https://my-proxy.example.com/v1/responses")).toThrow(
				'URL "https://my-proxy.example.com/v1/responses" did not match any known provider',
			);
		});

		it("should suggest providerName in the error message", () => {
			expect(() => resolveProvider("https://custom.host/api/chat")).toThrow(
				"Set providerName",
			);
		});
	});

	describe("newly added providers", () => {
		it("should match Amazon Bedrock and include region in endpoint", () => {
			const result = resolveProvider(
				"https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.titan-embed-text-v1/invoke",
			);
			expect(result.name).toBe("aws-bedrock");
			expect(result.endpoint).toBe(
				"bedrock-runtime/us-east-1/model/amazon.titan-embed-text-v1/invoke",
			);
		});

		it("should match Cerebras and strip /v1 prefix", () => {
			const result = resolveProvider("https://api.cerebras.ai/v1/chat/completions");
			expect(result.name).toBe("cerebras");
			expect(result.endpoint).toBe("chat/completions");
		});

		it("should match Cohere (.com domain)", () => {
			const result = resolveProvider("https://api.cohere.com/v2/chat");
			expect(result.name).toBe("cohere");
			expect(result.endpoint).toBe("v2/chat");
		});

		it("should match Cohere (.ai domain)", () => {
			const result = resolveProvider("https://api.cohere.ai/v1/chat");
			expect(result.name).toBe("cohere");
			expect(result.endpoint).toBe("v1/chat");
		});

		it("should match Deepgram", () => {
			const result = resolveProvider("https://api.deepgram.com/v1/listen");
			expect(result.name).toBe("deepgram");
			expect(result.endpoint).toBe("v1/listen");
		});

		it("should match ElevenLabs", () => {
			const result = resolveProvider("https://api.elevenlabs.io/v1/text-to-speech/abc123");
			expect(result.name).toBe("elevenlabs");
			expect(result.endpoint).toBe("v1/text-to-speech/abc123");
		});

		it("should match Fireworks and strip /inference/v1 prefix", () => {
			const result = resolveProvider(
				"https://api.fireworks.ai/inference/v1/chat/completions",
			);
			expect(result.name).toBe("fireworks");
			expect(result.endpoint).toBe("chat/completions");
		});

		it("should match HuggingFace and strip /models prefix", () => {
			const result = resolveProvider(
				"https://api-inference.huggingface.co/models/bigcode/starcoder",
			);
			expect(result.name).toBe("huggingface");
			expect(result.endpoint).toBe("bigcode/starcoder");
		});

		it("should match Cartesia", () => {
			const result = resolveProvider("https://api.cartesia.ai/v1/tts/bytes");
			expect(result.name).toBe("cartesia");
			expect(result.endpoint).toBe("v1/tts/bytes");
		});

		it("should match Fal AI", () => {
			const result = resolveProvider("https://fal.run/fal-ai/fast-sdxl");
			expect(result.name).toBe("fal");
			expect(result.endpoint).toBe("fal-ai/fast-sdxl");
		});

		it("should match Ideogram", () => {
			const result = resolveProvider("https://api.ideogram.ai/generate");
			expect(result.name).toBe("ideogram");
			expect(result.endpoint).toBe("generate");
		});

		it("should match the compat (Unified API) endpoint", () => {
			const result = resolveProvider(
				"https://gateway.ai.cloudflare.com/v1/compat/chat/completions",
			);
			expect(result.name).toBe("compat");
			expect(result.endpoint).toBe("chat/completions");
		});
	});

	describe("with explicit providerName", () => {
		it("should use the explicit name when URL matches the registry", () => {
			const result = resolveProvider("https://api.openai.com/v1/responses", "my-custom-name");
			expect(result.name).toBe("my-custom-name");
			expect(result.endpoint).toBe("v1/responses");
		});

		it("should still use the registry transform when URL matches", () => {
			const result = resolveProvider(
				"https://api.groq.com/openai/v1/chat/completions",
				"groq",
			);
			expect(result.name).toBe("groq");
			expect(result.endpoint).toBe("chat/completions");
		});

		it("should fall back to pathname for unrecognized URLs", () => {
			const result = resolveProvider(
				"https://my-proxy.example.com/v1/chat/completions",
				"openai",
			);
			expect(result.name).toBe("openai");
			expect(result.endpoint).toBe("v1/chat/completions");
		});

		it("should handle a custom base URL with nested path", () => {
			const result = resolveProvider(
				"https://proxy.corp.net/llm/openai/v1/responses",
				"openai",
			);
			expect(result.name).toBe("openai");
			expect(result.endpoint).toBe("llm/openai/v1/responses");
		});

		it("should handle a root-level custom URL", () => {
			const result = resolveProvider("https://localhost:8080/v1/chat/completions", "openai");
			expect(result.name).toBe("openai");
			expect(result.endpoint).toBe("v1/chat/completions");
		});

		it("should preserve query parameters for custom URLs", () => {
			const result = resolveProvider(
				"https://custom-api.example.com/v1/completions?stream=true",
				"openai",
			);
			expect(result.name).toBe("openai");
			expect(result.endpoint).toBe("v1/completions?stream=true");
		});

		it("should preserve multiple query parameters", () => {
			const result = resolveProvider(
				"https://custom-api.example.com/v1/chat?api-version=2024-02-15&stream=true",
				"openai",
			);
			expect(result.name).toBe("openai");
			expect(result.endpoint).toBe("v1/chat?api-version=2024-02-15&stream=true");
		});

		it("should handle custom URLs with no query parameters", () => {
			const result = resolveProvider("https://custom-api.example.com/v1/chat", "openai");
			expect(result.name).toBe("openai");
			expect(result.endpoint).toBe("v1/chat");
		});
	});
});
