import { describe, it, expect } from "vitest";
import { convertToWorkersAIChatMessages } from "../src/convert-to-workersai-chat-messages";
import { createAISDKToolCallId } from "../src/utils";

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

		it("should restore rewritten assistant tool call IDs before sending to Workers AI", () => {
			const originalId = "functions.list_toolbox_tools:0";
			const rewrittenId = createAISDKToolCallId(originalId);

			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "assistant" as const,
					content: [
						{
							type: "tool-call" as const,
							toolCallId: rewrittenId,
							toolName: "list_toolbox_tools",
							input: {},
						},
					],
				},
			]);

			expect(messages[0].tool_calls![0].id).toBe(originalId);
		});

		it("should restore rewritten tool result IDs for tool error outputs", () => {
			const originalId = "functions.invoke_toolbox_tool:1";
			const rewrittenId = createAISDKToolCallId(originalId);

			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: rewrittenId,
							toolName: "invoke_toolbox_tool",
							output: { type: "error-text", value: "tool failed" } as any,
						},
					],
				},
			]);

			expect(messages[0].tool_call_id).toBe(originalId);
			expect(messages[0].content).toBe("tool failed");
		});

		it("should round-trip already-unique GLM-style IDs back to their exact original", () => {
			const originalId = "chatcmpl-tool-8a89c35582d60474";
			const rewrittenId = createAISDKToolCallId(originalId);

			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "assistant" as const,
					content: [
						{
							type: "tool-call" as const,
							toolCallId: rewrittenId,
							toolName: "get_weather",
							input: { city: "London" },
						},
					],
				},
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: rewrittenId,
							toolName: "get_weather",
							output: { type: "json", value: { weather: "Raining" } } as any,
						},
					],
				},
			]);

			expect(messages[0].tool_calls![0].id).toBe(originalId);
			expect(messages[1].tool_call_id).toBe(originalId);
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
		it("should send reasoning as the `reasoning` field, not concatenated into content", () => {
			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{ type: "reasoning" as const, text: "Let me think about this carefully." },
						{ type: "text" as const, text: "The answer is 42." },
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			// reasoning goes into its own field, not smeared into content
			expect(messages[0].content).toBe("The answer is 42.");
			expect((messages[0] as any).reasoning).toBe("Let me think about this carefully.");
		});

		it("should omit the reasoning field when there is no reasoning content", () => {
			const prompt = [
				{
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "The answer is 42." }],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages[0].content).toBe("The answer is 42.");
			expect((messages[0] as any).reasoning).toBeUndefined();
		});

		it("should accumulate multiple reasoning parts into a single reasoning field", () => {
			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{ type: "reasoning" as const, text: "First thought. " },
						{ type: "reasoning" as const, text: "Second thought." },
						{ type: "text" as const, text: "Done." },
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages[0].content).toBe("Done.");
			expect((messages[0] as any).reasoning).toBe("First thought. Second thought.");
		});

		it("should preserve tool calls alongside reasoning in multi-turn conversations", () => {
			const prompt = [
				{
					role: "assistant" as const,
					content: [
						{ type: "reasoning" as const, text: "I should search for this." },
						{ type: "text" as const, text: "Let me look that up." },
						{
							type: "tool-call" as const,
							toolCallId: "call-1",
							toolName: "search",
							input: { query: "workers ai" },
						},
					],
				},
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "search",
							output: { results: ["result1"] },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			const assistantMsg = messages[0] as any;
			expect(assistantMsg.role).toBe("assistant");
			expect(assistantMsg.content).toBe("Let me look that up.");
			expect(assistantMsg.reasoning).toBe("I should search for this.");
			expect(assistantMsg.tool_calls).toHaveLength(1);
			expect(assistantMsg.tool_calls[0].id).toBe("call-1");
			// tool result message is unaffected
			expect(messages[1].role).toBe("tool");
			expect(messages[1].tool_call_id).toBe("call-1");
		});
	});

	describe("tool result output unwrapping", () => {
		it("should unwrap text output — not stringify the wrapper object", () => {
			// LanguageModelV3ToolResultOutput is { type: 'text', value: string }
			// The value must be sent to the API, not the wrapper object itself.
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "getWeather",
							output: { type: "text", value: "Tokyo: 22°C, sunny" } as any,
						},
					],
				},
			]);

			expect(messages[0].content).toBe("Tokyo: 22°C, sunny");
			// Must NOT be the stringified wrapper
			expect(messages[0].content).not.toContain('"type":"text"');
			expect(messages[0].content).not.toContain('"value"');
		});

		it("should unwrap json output — serialize only the value", () => {
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "getWeather",
							output: {
								type: "json",
								value: { city: "Tokyo", temp: 22, condition: "sunny" },
							} as any,
						},
					],
				},
			]);

			expect(messages[0].content).toBe(
				JSON.stringify({ city: "Tokyo", temp: 22, condition: "sunny" }),
			);
			expect(messages[0].content).not.toContain('"type":"json"');
		});

		it("should handle multiple tool results with correct unwrapping", () => {
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "getUserInfo",
							output: {
								type: "text",
								value: '{"id":"u123","username":"alice"}',
							} as any,
						},
						{
							type: "tool-result" as const,
							toolCallId: "call-2",
							toolName: "getBalance",
							output: { type: "json", value: { balance: 1234.56 } } as any,
						},
					],
				},
			]);

			expect(messages).toHaveLength(2);
			expect(messages[0].content).toBe('{"id":"u123","username":"alice"}');
			expect(messages[1].content).toBe(JSON.stringify({ balance: 1234.56 }));
		});

		it("should unwrap error-text output as a plain string — not double-quoted", () => {
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "fetchData",
							output: { type: "error-text", value: "Connection timed out" } as any,
						},
					],
				},
			]);

			expect(messages[0].content).toBe("Connection timed out");
			expect(messages[0].content).not.toBe('"Connection timed out"');
		});

		it("should surface execution-denied with reason", () => {
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "deleteFile",
							output: {
								type: "execution-denied",
								reason: "User rejected the action",
							} as any,
						},
					],
				},
			]);

			expect(messages[0].content).toBe("Tool execution denied: User rejected the action");
		});

		it("should surface execution-denied without reason", () => {
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "deleteFile",
							output: { type: "execution-denied" } as any,
						},
					],
				},
			]);

			expect(messages[0].content).toBe("Tool execution was denied.");
		});

		it("should serialize error-json output — not double-wrap", () => {
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "apiCall",
							output: {
								type: "error-json",
								value: { code: 404, message: "Not found" },
							} as any,
						},
					],
				},
			]);

			expect(messages[0].content).toBe(JSON.stringify({ code: 404, message: "Not found" }));
			expect(messages[0].content).not.toContain('"type":"error-json"');
		});

		it("should extract text from content output parts", () => {
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "screenshotTool",
							output: {
								type: "content",
								value: [
									{ type: "text", text: "Screenshot captured successfully" },
									{ type: "file-data", data: "iVBOR...", mediaType: "image/png" },
									{ type: "text", text: "Dimensions: 1920x1080" },
								],
							} as any,
						},
					],
				},
			]);

			expect(messages[0].content).toBe(
				"Screenshot captured successfully\nDimensions: 1920x1080",
			);
		});

		it("should handle content output with no text parts", () => {
			const { messages } = convertToWorkersAIChatMessages([
				{
					role: "tool" as const,
					content: [
						{
							type: "tool-result" as const,
							toolCallId: "call-1",
							toolName: "screenshotTool",
							output: {
								type: "content",
								value: [
									{ type: "file-data", data: "iVBOR...", mediaType: "image/png" },
								],
							} as any,
						},
					],
				},
			]);

			expect(messages[0].content).toBe("");
		});
	});
});
