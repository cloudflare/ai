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
});
