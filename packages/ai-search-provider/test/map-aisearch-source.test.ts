import { describe, expect, it } from "vitest";
import { type AISearchChunk, mapAISearchChunkToSource } from "../src/map-aisearch-source";

describe("mapAISearchChunkToSource", () => {
	it("maps a chunk to a url source with metadata under the aisearch key", () => {
		const chunk: AISearchChunk = {
			id: "chunk-1",
			type: "text",
			score: 0.5,
			text: "hi",
			item: { key: "guide.md", timestamp: 1, metadata: { a: 1 } },
			scoring_details: { vector_score: 0.5 },
			instance_id: "docs",
		};

		expect(mapAISearchChunkToSource(chunk)).toMatchObject({
			type: "source",
			sourceType: "url",
			id: "chunk-1",
			url: "guide.md",
			providerMetadata: {
				aisearch: {
					instance_id: "docs",
					score: 0.5,
					item: { key: "guide.md" },
				},
			},
		});
	});

	it("falls back to the chunk id when there is no item key", () => {
		const chunk = {
			id: "chunk-2",
			type: "text",
			score: 0.1,
			text: "hi",
		} as unknown as AISearchChunk;

		expect(mapAISearchChunkToSource(chunk).url).toBe("chunk-2");
	});
});
