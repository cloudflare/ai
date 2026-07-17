import { generateText, streamText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import { createAISearch, createAutoRAG } from "../src/index";

// ---------------------------------------------------------------------------
// Mock AI Search binding
// ---------------------------------------------------------------------------

function mockAISearchBinding(options?: {
	response?: string;
	data?: Array<{ file_id: string; filename: string; score: number }>;
	streamChunks?: string[];
}) {
	const response = options?.response ?? "AI Search says hello.";
	const data = options?.data ?? [
		{ file_id: "file-1", filename: "doc1.pdf", score: 0.95 },
		{ file_id: "file-2", filename: "doc2.pdf", score: 0.87 },
	];

	return {
		aiSearch: async (params: { query: string; stream?: boolean }) => {
			if (params.stream) {
				const encoder = new TextEncoder();
				return new ReadableStream({
					start(controller) {
						for (const chunk of options?.streamChunks ?? ["AI Search ", "streamed."]) {
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify({ response: chunk })}\n\n`),
							);
						}
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
						controller.close();
					},
				});
			}

			return { response, data };
		},
	} as unknown as AutoRAG;
}

// ---------------------------------------------------------------------------
// AI Search (new name) tests
// ---------------------------------------------------------------------------

describe("AI Search - doGenerate", () => {
	it("should return text and sources from aiSearch", async () => {
		const aisearch = createAISearch({
			binding: mockAISearchBinding({
				response: "AI Gateway can be set up via the Cloudflare dashboard.",
				data: [
					{ file_id: "f1", filename: "setup-guide.md", score: 0.98 },
					{ file_id: "f2", filename: "faq.md", score: 0.75 },
				],
			}),
		});

		const result = await generateText({
			model: aisearch(),
			messages: [{ role: "user", content: "How to setup AI Gateway?" }],
		});

		expect(result.text).toBe("AI Gateway can be set up via the Cloudflare dashboard.");
	});

	it("should pass messages as query to aiSearch", async () => {
		let capturedQuery = "";
		const binding = {
			aiSearch: async (params: { query: string }) => {
				capturedQuery = params.query;
				return { response: "ok", data: [] };
			},
		} as unknown as AutoRAG;

		const aisearch = createAISearch({ binding });

		await generateText({
			model: aisearch(),
			messages: [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there!" },
				{ role: "user", content: "What is AI Gateway?" },
			],
		});

		expect(capturedQuery).toContain("user: Hello");
		expect(capturedQuery).toContain("assistant: Hi there!");
		expect(capturedQuery).toContain("user: What is AI Gateway?");
	});

	it("should handle empty data array", async () => {
		const aisearch = createAISearch({
			binding: mockAISearchBinding({
				response: "I don't know.",
				data: [],
			}),
		});

		const result = await generateText({
			model: aisearch(),
			messages: [{ role: "user", content: "Unknown topic" }],
		});

		expect(result.text).toBe("I don't know.");
	});
});

describe("AI Search - doStream", () => {
	it("should stream text from aiSearch", async () => {
		const aisearch = createAISearch({
			binding: mockAISearchBinding({
				streamChunks: ["Hello ", "from ", "AI Search!"],
			}),
		});

		const result = streamText({
			model: aisearch(),
			messages: [{ role: "user", content: "Hello" }],
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("Hello from AI Search!");
	});

	it("should handle empty stream", async () => {
		const aisearch = createAISearch({
			binding: mockAISearchBinding({
				streamChunks: [],
			}),
		});

		const result = streamText({
			model: aisearch(),
			messages: [{ role: "user", content: "Hello" }],
		});

		let text = "";
		for await (const chunk of result.textStream) {
			text += chunk;
		}

		expect(text).toBe("");
	});
});

describe("AI Search - unsupported feature warnings", () => {
	it("should warn when tools are provided", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const aisearch = createAISearch({
			binding: mockAISearchBinding(),
		});

		const result = await generateText({
			model: aisearch(),
			messages: [{ role: "user", content: "Hello" }],
			tools: {
				myTool: {
					description: "A tool",
					inputSchema: z.object({ x: z.string() }),
				},
			},
		});

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("Tools are not supported by AI Search"),
		);
		// Should still return text despite the warning
		expect(result.text).toBe("AI Search says hello.");

		warnSpy.mockRestore();
	});
});

describe("AI Search - provider API", () => {
	it("should use 'aisearch.chat' as provider name", () => {
		const aisearch = createAISearch({
			binding: mockAISearchBinding(),
		});

		const model = aisearch();
		expect(model.specificationVersion).toBe("v4");
		expect(model.provider).toBe("aisearch.chat");
	});

	it("should work via .chat() method", () => {
		const aisearch = createAISearch({
			binding: mockAISearchBinding(),
		});

		const model = aisearch.chat();
		expect(model.specificationVersion).toBe("v4");
		expect(model.provider).toBe("aisearch.chat");
	});

	it("should throw when called with new keyword", () => {
		const aisearch = createAISearch({
			binding: mockAISearchBinding(),
		});

		expect(() => new (aisearch as any)()).toThrow();
	});
});

// ---------------------------------------------------------------------------
// Deprecated AutoRAG alias tests
// ---------------------------------------------------------------------------

describe("AutoRAG (deprecated alias)", () => {
	it("createAutoRAG should work and emit deprecation warning", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const autorag = createAutoRAG({
			binding: mockAISearchBinding({
				response: "Hello from deprecated path.",
			}),
		});

		const result = await generateText({
			model: autorag(),
			messages: [{ role: "user", content: "Hello" }],
		});

		expect(result.text).toBe("Hello from deprecated path.");
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("createAutoRAG is deprecated"),
		);

		warnSpy.mockRestore();
	});

	it("createAutoRAG should only warn once", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		// Reset the warning flag by calling createAutoRAG multiple times
		// Note: the flag is module-level, so it may already be set from the test above
		createAutoRAG({ binding: mockAISearchBinding() });
		createAutoRAG({ binding: mockAISearchBinding() });

		// Should have at most 1 warning (may be 0 if already warned in previous test)
		const autoragWarnings = warnSpy.mock.calls.filter((call) =>
			String(call[0]).includes("createAutoRAG"),
		);
		expect(autoragWarnings.length).toBeLessThanOrEqual(1);

		warnSpy.mockRestore();
	});

	it("AutoRAG provider should have autorag.chat as provider name (backward compat)", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const autorag = createAutoRAG({
			binding: mockAISearchBinding(),
		});

		// createAutoRAG preserves "autorag.chat" for backward compatibility
		const model = autorag();
		expect(model.provider).toBe("autorag.chat");

		vi.restoreAllMocks();
	});

	it("createAISearch should use aisearch.chat as provider name", () => {
		const aisearch = createAISearch({
			binding: mockAISearchBinding(),
		});

		const model = aisearch();
		expect(model.provider).toBe("aisearch.chat");
	});
});
