import { describe, it, expect } from "vitest";
import { convertToWorkersAIChatMessages } from "../src/convert-to-workersai-chat-messages";

describe("convertToWorkersAIChatMessages", () => {
	describe("tool call ID preservation", () => {
		it("should preserve original tool call IDs in assistant messages", () => {
			const originalId = "chatcmpl-tool-abc123";

			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{
							type: "tool-call" as const,
							toolCallId: originalId,
							toolName: "writeFile",
							input: { filename: "test.js", content: 'console.log("test")' },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			// Verify ID is preserved, not regenerated
			expect(messages[0].tool_calls).toBeDefined();
			expect(messages[0].tool_calls![0].id).toBe(originalId);
			expect(messages[0].tool_calls![0].id).not.toBe("functions.writeFile:0");
		});

		it("should match tool call and result IDs in multi-turn conversations", () => {
			const originalId = "chatcmpl-tool-abc123";

			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{
							type: "tool-call" as const,
							toolCallId: originalId,
							toolName: "writeFile",
							input: { filename: "test.js", content: "test" },
						},
					],
				},
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: originalId,
							toolName: "writeFile",
							output: { success: true },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			// Verify assistant and tool result use same ID
			expect(messages[0].tool_calls![0].id).toBe(originalId);
			expect(messages[1].tool_call_id).toBe(originalId);
			expect(messages[0].tool_calls![0].id).toBe(messages[1].tool_call_id);
		});

		it("should preserve multiple unique tool call IDs", () => {
			const id1 = "chatcmpl-tool-abc123";
			const id2 = "chatcmpl-tool-def456";

			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{
							type: "tool-call" as const,
							toolCallId: id1,
							toolName: "writeFile",
							input: { filename: "a.js", content: "a" },
						},
						{
							type: "tool-call" as const,
							toolCallId: id2,
							toolName: "writeFile",
							input: { filename: "b.js", content: "b" },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			// Verify each tool call preserves its unique ID
			expect(messages[0].tool_calls).toBeDefined();
			expect(messages[0].tool_calls![0].id).toBe(id1);
			expect(messages[0].tool_calls![1].id).toBe(id2);
			expect(messages[0].tool_calls![0].id).not.toBe("functions.writeFile:0");
			expect(messages[0].tool_calls![1].id).not.toBe("functions.writeFile:1");
		});

		it("should not add tool call JSON to text content", () => {
			const originalId = "chatcmpl-tool-abc123";

			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{
							type: "text" as const,
							text: "I'll create that file for you.",
						},
						{
							type: "tool-call" as const,
							toolCallId: originalId,
							toolName: "writeFile",
							input: { filename: "test.js", content: "test" },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			// Verify content only contains text, not tool call JSON
			expect(messages[0].content).toBe("I'll create that file for you.");
			expect(messages[0].content).not.toContain('"name"');
			expect(messages[0].content).not.toContain('"parameters"');
			expect(messages[0].content).not.toContain("writeFile");
		});

		it("should handle assistant messages with only tool calls and no text", () => {
			const originalId = "chatcmpl-tool-abc123";

			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{
							type: "tool-call" as const,
							toolCallId: originalId,
							toolName: "writeFile",
							input: { filename: "test.js", content: "test" },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			// Content should be empty, not contain tool call JSON
			expect(messages[0].content).toBe("");
			expect(messages[0].tool_calls).toBeDefined();
			expect(messages[0].tool_calls![0].id).toBe(originalId);
		});
	});

	describe("basic message conversion", () => {
		it("should convert system messages correctly", () => {
			const prompt = [
				{
					role: "system" as const,
					content: "You are a helpful assistant.",
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(1);
			expect(messages[0].role).toBe("system");
			expect(messages[0].content).toBe("You are a helpful assistant.");
		});

		it("should convert user messages correctly", () => {
			const prompt = [
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: "Hello, world!" }],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(1);
			expect(messages[0].role).toBe("user");
			expect(messages[0].content).toBe("Hello, world!");
		});

		it("should convert assistant text messages correctly", () => {
			const prompt = [
				{
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "Hello, how can I help?" }],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(1);
			expect(messages[0].role).toBe("assistant");
			expect(messages[0].content).toBe("Hello, how can I help?");
			expect(messages[0].tool_calls).toBeUndefined();
		});
	});

	describe("image handling", () => {
		it("should build content array with image_url for user file parts", () => {
			const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

			const prompt = [
				{
					role: "user" as const,
					content: [
						{ type: "text" as const, text: "What's in this image?" },
						{
							type: "file" as const,
							data: imageData,
							mediaType: "image/png",
							providerOptions: undefined,
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(1);
			const content = messages[0].content;
			expect(Array.isArray(content)).toBe(true);
			const parts = content as Array<{
				type: string;
				text?: string;
				image_url?: { url: string };
			}>;
			expect(parts).toHaveLength(2);
			expect(parts[0]).toEqual({ type: "text", text: "What's in this image?" });
			expect(parts[1].type).toBe("image_url");
			expect(parts[1].image_url!.url).toMatch(/^data:image\/png;base64,/);
		});

		it("should combine text parts in content array when images present", () => {
			const prompt = [
				{
					role: "user" as const,
					content: [
						{ type: "text" as const, text: "First" },
						{
							type: "file" as const,
							data: new Uint8Array([1, 2, 3]),
							mediaType: "image/png",
							providerOptions: undefined,
						},
						{ type: "text" as const, text: "Second" },
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			const content = messages[0].content;
			expect(Array.isArray(content)).toBe(true);
			const parts = content as Array<{ type: string; text?: string }>;
			expect(parts[0]).toEqual({ type: "text", text: "First\nSecond" });
			expect(parts[1].type).toBe("image_url");
		});

		it("should handle user message with only an image (no text)", () => {
			const prompt = [
				{
					role: "user" as const,
					content: [
						{
							type: "file" as const,
							data: new Uint8Array([1, 2, 3]),
							mediaType: "image/jpeg",
							providerOptions: undefined,
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(1);
			const content = messages[0].content;
			expect(Array.isArray(content)).toBe(true);
			const parts = content as Array<{ type: string }>;
			expect(parts).toHaveLength(1);
			expect(parts[0].type).toBe("image_url");
		});

		it("should handle base64 string data", () => {
			const originalBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
			const base64 = btoa(String.fromCharCode(...originalBytes));

			const prompt = [
				{
					role: "user" as const,
					content: [
						{ type: "text" as const, text: "Describe this image" },
						{
							type: "file" as const,
							data: base64,
							mediaType: "image/png",
							providerOptions: undefined,
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(1);
			const content = messages[0].content;
			expect(Array.isArray(content)).toBe(true);
			const parts = content as Array<{ type: string; image_url?: { url: string } }>;
			expect(parts[1].type).toBe("image_url");
			expect(parts[1].image_url!.url).toMatch(/^data:image\/png;base64,/);
		});

		it("should handle data URL strings", () => {
			const originalBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
			const base64 = btoa(String.fromCharCode(...originalBytes));
			const dataUrl = `data:image/jpeg;base64,${base64}`;

			const prompt = [
				{
					role: "user" as const,
					content: [
						{ type: "text" as const, text: "What is this?" },
						{
							type: "file" as const,
							data: dataUrl,
							mediaType: "image/jpeg",
							providerOptions: undefined,
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(1);
			const content = messages[0].content;
			expect(Array.isArray(content)).toBe(true);
			const parts = content as Array<{ type: string; image_url?: { url: string } }>;
			expect(parts[1].type).toBe("image_url");
			expect(parts[1].image_url!.url).toMatch(/^data:image\/jpeg;base64,/);
		});

		it("should throw for URL image sources", () => {
			const prompt = [
				{
					role: "user" as const,
					content: [
						{
							type: "file" as const,
							data: new URL("https://example.com/image.png"),
							mediaType: "image/png",
							providerOptions: undefined,
						},
					],
				},
			];

			expect(() => convertToWorkersAIChatMessages(prompt)).toThrow(
				"URL image sources are not supported by Workers AI",
			);
		});

		it("should use plain string content when no images are present", () => {
			const prompt = [
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: "Just text, no images" }],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages[0].content).toBe("Just text, no images");
			expect(typeof messages[0].content).toBe("string");
		});

		it("should handle multiple images in a single message", () => {
			const prompt = [
				{
					role: "user" as const,
					content: [
						{ type: "text" as const, text: "Compare these images" },
						{
							type: "file" as const,
							data: new Uint8Array([1, 2, 3]),
							mediaType: "image/png",
							providerOptions: undefined,
						},
						{
							type: "file" as const,
							data: new Uint8Array([4, 5, 6]),
							mediaType: "image/jpeg",
							providerOptions: undefined,
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			const content = messages[0].content;
			expect(Array.isArray(content)).toBe(true);
			const parts = content as Array<{ type: string }>;
			expect(parts).toHaveLength(3); // 1 text + 2 image_url
			expect(parts[0].type).toBe("text");
			expect(parts[1].type).toBe("image_url");
			expect(parts[2].type).toBe("image_url");
		});
	});

	describe("reasoning content", () => {
		it("should concatenate reasoning text into assistant content", () => {
			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{ type: "reasoning" as const, text: "Let me think..." },
						{ type: "text" as const, text: "The answer is 42." },
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages[0].content).toBe("Let me think...The answer is 42.");
		});
	});
});
