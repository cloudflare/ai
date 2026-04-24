import type { LanguageModelV3 } from "@ai-sdk/provider";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/providers/unified", () => ({
	createUnified: vi.fn(
		() =>
			vi.fn((modelId: string) =>
				({ source: "unified", modelId }) as unknown as LanguageModelV3,
			),
	),
}));

import { createUnified } from "../src/providers/unified";
import { createProviderRouter } from "../src/providers/router";

type MockModel = {
	source: string;
	modelId: string;
};

const asMockModel = (model: LanguageModelV3) => model as unknown as MockModel;

const makeProvider = (source: string) =>
	vi.fn((modelId: string) =>
		({ source, modelId }) as unknown as LanguageModelV3,
	);

describe("createProviderRouter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("selects native provider when model ID has matching prefix", () => {
		const anthropic = makeProvider("anthropic");
		const router = createProviderRouter({ providers: { anthropic } });

		const model = asMockModel(router("anthropic/claude-sonnet-4-5"));

		expect(model).toEqual({
			source: "anthropic",
			modelId: "claude-sonnet-4-5",
		});
		expect(anthropic).toHaveBeenCalledWith("claude-sonnet-4-5");
	});

	it("strips prefix and passes bare model name to native provider", () => {
		const anthropic = makeProvider("anthropic");
		const router = createProviderRouter({ providers: { anthropic } });

		router("anthropic/claude-3-5-haiku-latest");

		expect(anthropic).toHaveBeenCalledWith("claude-3-5-haiku-latest");
	});

	it("falls back to unified for unknown prefixes", () => {
		const anthropic = makeProvider("anthropic");
		const router = createProviderRouter({ providers: { anthropic } });

		const model = asMockModel(router("unknown/model-id"));

		expect(model).toEqual({ source: "unified", modelId: "unknown/model-id" });
		expect(anthropic).not.toHaveBeenCalled();
	});

	it("falls back to unified for model IDs without a slash", () => {
		const anthropic = makeProvider("anthropic");
		const router = createProviderRouter({ providers: { anthropic } });

		const model = asMockModel(router("claude-sonnet-4-5"));

		expect(model).toEqual({ source: "unified", modelId: "claude-sonnet-4-5" });
		expect(anthropic).not.toHaveBeenCalled();
	});

	it("uses custom fallback when provided", () => {
		const anthropic = makeProvider("anthropic");
		const customFallback = makeProvider("custom-fallback");
		const router = createProviderRouter({
			providers: { anthropic },
			fallback: customFallback,
		});

		const model = asMockModel(router("unknown/model-id"));

		expect(model).toEqual({ source: "custom-fallback", modelId: "unknown/model-id" });
		expect(customFallback).toHaveBeenCalledWith("unknown/model-id");
		expect(createUnified).not.toHaveBeenCalled();
	});

	it("routes correctly when multiple providers are registered", () => {
		const anthropic = makeProvider("anthropic");
		const openai = makeProvider("openai");
		const router = createProviderRouter({ providers: { anthropic, openai } });

		const anthropicModel = asMockModel(router("anthropic/claude-3-opus"));
		const openaiModel = asMockModel(router("openai/gpt-4o-mini"));

		expect(anthropicModel).toEqual({ source: "anthropic", modelId: "claude-3-opus" });
		expect(openaiModel).toEqual({ source: "openai", modelId: "gpt-4o-mini" });
		expect(anthropic).toHaveBeenCalledWith("claude-3-opus");
		expect(openai).toHaveBeenCalledWith("gpt-4o-mini");
	});

	it("falls back to unified for every model when providers map is empty", () => {
		const router = createProviderRouter({ providers: {} });

		const modelA = asMockModel(router("anthropic/claude-sonnet-4-5"));
		const modelB = asMockModel(router("gpt-4o-mini"));

		expect(modelA).toEqual({
			source: "unified",
			modelId: "anthropic/claude-sonnet-4-5",
		});
		expect(modelB).toEqual({ source: "unified", modelId: "gpt-4o-mini" });
	});
});
