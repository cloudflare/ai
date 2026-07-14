import type { LanguageModelV3 } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { createAiGateway } from "../src";

describe("supportedUrls", () => {
	it("forwards supported URLs from the wrapped model", async () => {
		const supportedUrls = {
			"application/pdf": [/^https:\/\/example\.com\/.*$/],
			"image/*": [/^https:\/\//],
		};
		const wrappedModel = {
			modelId: "test-model",
			provider: "test-provider",
			specificationVersion: "v3",
			supportedUrls,
		} as unknown as LanguageModelV3;

		const aigateway = createAiGateway({
			accountId: "test-account-id",
			apiKey: "test-api-key",
			gateway: "test-gateway",
		});

		await expect(await aigateway(wrappedModel).supportedUrls).toBe(supportedUrls);
	});
});
