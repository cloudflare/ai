import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { convertToWorkersAIChatMessages } from "../src/convert-to-workersai-chat-messages";
import type { WorkersAIAssistantMessage, WorkersAIToolMessage } from "../src/workersai-chat-prompt";

describe("convertToWorkersAIChatMessages", () => {
	describe("system messages", () => {
		it("should convert system messages", () => {
			const prompt: LanguageModelV3Prompt = [
				{ role: "system", content: "You are a helpful assistant." },
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toEqual([{ role: "system", content: "You are a helpful assistant." }]);
		});
	});

	describe("user messages", () => {
		it("should convert user text messages", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "user",
					content: [{ type: "text", text: "Hello, how are you?" }],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toEqual([{ role: "user", content: "Hello, how are you?" }]);
		});

		it("should join multiple text parts with newlines", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "user",
					content: [
						{ type: "text", text: "First part" },
						{ type: "text", text: "Second part" },
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toEqual([{ role: "user", content: "First part\nSecond part" }]);
		});
	});

	describe("assistant messages", () => {
		it("should convert assistant text messages", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "assistant",
					content: [{ type: "text", text: "I am doing well, thank you!" }],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toEqual([
				{
					role: "assistant",
					content: "I am doing well, thank you!",
					tool_calls: undefined,
				},
			]);
		});

		it("should convert assistant messages with tool calls only", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "assistant",
					content: [
						{
							type: "tool-call",
							toolCallId: "call_123",
							toolName: "getWeather",
							input: { location: "San Francisco" },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toEqual([
				{
					role: "assistant",
					content: "",
					tool_calls: [
						{
							id: "functions.getWeather:0",
							type: "function",
							function: {
								name: "getWeather",
								arguments: '{"location":"San Francisco"}',
							},
						},
					],
				},
			]);
		});

		it("should preserve text content when assistant message has both text and tool calls", () => {
			// This is the key test for the bug fix - text content should NOT be overwritten by tool calls
			const prompt: LanguageModelV3Prompt = [
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "I'll help you create a Tic Tac Toe game. Let me write the code for you.",
						},
						{
							type: "tool-call",
							toolCallId: "call_456",
							toolName: "writeFile",
							input: { filename: "game.js", content: "console.log('game');" },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toEqual([
				{
					role: "assistant",
					content:
						"I'll help you create a Tic Tac Toe game. Let me write the code for you.",
					tool_calls: [
						{
							id: "functions.writeFile:0",
							type: "function",
							function: {
								name: "writeFile",
								arguments:
									'{"filename":"game.js","content":"console.log(\'game\');"}',
							},
						},
					],
				},
			]);
		});

		it("should preserve text content with multiple tool calls", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "I'll create two files for your project.",
						},
						{
							type: "tool-call",
							toolCallId: "call_1",
							toolName: "writeFile",
							input: { filename: "index.js", content: "// main file" },
						},
						{
							type: "tool-call",
							toolCallId: "call_2",
							toolName: "writeFile",
							input: { filename: "utils.js", content: "// utils file" },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(1);
			const assistantMsg = messages[0] as WorkersAIAssistantMessage;
			expect(assistantMsg.role).toBe("assistant");
			expect(assistantMsg.content).toBe("I'll create two files for your project.");
			expect(assistantMsg.tool_calls).toHaveLength(2);
			expect(assistantMsg.tool_calls?.[0].function.name).toBe("writeFile");
			expect(assistantMsg.tool_calls?.[1].function.name).toBe("writeFile");
		});

		it("should handle text appearing after tool calls", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "assistant",
					content: [
						{
							type: "tool-call",
							toolCallId: "call_1",
							toolName: "readFile",
							input: { filename: "data.json" },
						},
						{
							type: "text",
							text: "Let me read that file for you.",
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			const assistantMsg = messages[0] as WorkersAIAssistantMessage;
			expect(assistantMsg.content).toBe("Let me read that file for you.");
			expect(assistantMsg.tool_calls).toHaveLength(1);
		});

		it("should concatenate multiple text parts with tool calls interspersed", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "assistant",
					content: [
						{ type: "text", text: "First, " },
						{
							type: "tool-call",
							toolCallId: "call_1",
							toolName: "step1",
							input: {},
						},
						{ type: "text", text: "then second." },
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			const assistantMsg = messages[0] as WorkersAIAssistantMessage;
			expect(assistantMsg.content).toBe("First, then second.");
			expect(assistantMsg.tool_calls).toHaveLength(1);
		});
	});

	describe("tool messages", () => {
		it("should convert tool result messages", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "tool",
					content: [
						{
							type: "tool-result",
							toolCallId: "call_123",
							toolName: "getWeather",
							output: {
								type: "text",
								value: '{"temperature":72,"condition":"sunny"}',
							},
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toEqual([
				{
					role: "tool",
					name: "getWeather",
					tool_call_id: "functions.getWeather:0",
					content:
						'{"type":"text","value":"{\\"temperature\\":72,\\"condition\\":\\"sunny\\"}"}',
				},
			]);
		});

		it("should convert multiple tool results", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "tool",
					content: [
						{
							type: "tool-result",
							toolCallId: "call_1",
							toolName: "tool1",
							output: { type: "text", value: "first" },
						},
						{
							type: "tool-result",
							toolCallId: "call_2",
							toolName: "tool2",
							output: { type: "text", value: "second" },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(2);
			const tool1 = messages[0] as WorkersAIToolMessage;
			const tool2 = messages[1] as WorkersAIToolMessage;
			expect(tool1.name).toBe("tool1");
			expect(tool2.name).toBe("tool2");
		});
	});

	describe("multi-turn conversations with tool calls", () => {
		it("should correctly handle a full conversation with tool calls", () => {
			// This simulates the exact scenario from the bug report
			const prompt: LanguageModelV3Prompt = [
				{
					role: "system",
					content: "You are a helpful coding assistant.",
				},
				{
					role: "user",
					content: [{ type: "text", text: "Make me a tic tac toe game" }],
				},
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "I'll create a Tic Tac Toe game for you with a client-server architecture.",
						},
						{
							type: "tool-call",
							toolCallId: "call_write_1",
							toolName: "writeFile",
							input: {
								filename: "server.js",
								content: "const express = require('express');",
							},
						},
					],
				},
				{
					role: "tool",
					content: [
						{
							type: "tool-result",
							toolCallId: "call_write_1",
							toolName: "writeFile",
							output: { type: "text", value: '{"success":true}' },
						},
					],
				},
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "Great! Now let me create the client file.",
						},
						{
							type: "tool-call",
							toolCallId: "call_write_2",
							toolName: "writeFile",
							input: { filename: "client.js", content: "console.log('client');" },
						},
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			expect(messages).toHaveLength(5);

			// System message
			expect(messages[0]).toEqual({
				role: "system",
				content: "You are a helpful coding assistant.",
			});

			// User message
			expect(messages[1]).toEqual({
				role: "user",
				content: "Make me a tic tac toe game",
			});

			// First assistant message - THIS IS THE KEY CHECK
			// The content should be the text, NOT the stringified tool call
			const firstAssistant = messages[2] as WorkersAIAssistantMessage;
			expect(firstAssistant.role).toBe("assistant");
			expect(firstAssistant.content).toBe(
				"I'll create a Tic Tac Toe game for you with a client-server architecture.",
			);
			expect(firstAssistant.content).not.toContain("writeFile");
			expect(firstAssistant.content).not.toContain("filename");
			expect(firstAssistant.tool_calls).toHaveLength(1);
			expect(firstAssistant.tool_calls?.[0].function.name).toBe("writeFile");

			// Tool result
			const toolResult = messages[3] as WorkersAIToolMessage;
			expect(toolResult.role).toBe("tool");
			expect(toolResult.name).toBe("writeFile");

			// Second assistant message - also should preserve text
			const secondAssistant = messages[4] as WorkersAIAssistantMessage;
			expect(secondAssistant.role).toBe("assistant");
			expect(secondAssistant.content).toBe("Great! Now let me create the client file.");
			expect(secondAssistant.content).not.toContain("writeFile");
			expect(secondAssistant.tool_calls).toHaveLength(1);
		});
	});

	describe("reasoning content", () => {
		it("should include reasoning text in content", () => {
			const prompt: LanguageModelV3Prompt = [
				{
					role: "assistant",
					content: [
						{ type: "reasoning", text: "Let me think about this..." },
						{ type: "text", text: "Here is my answer." },
					],
				},
			];

			const { messages } = convertToWorkersAIChatMessages(prompt);

			const assistantMsg = messages[0] as WorkersAIAssistantMessage;
			expect(assistantMsg.content).toBe("Let me think about this...Here is my answer.");
		});
	});
});
