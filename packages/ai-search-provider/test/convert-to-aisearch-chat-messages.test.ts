import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { convertToAISearchMessages } from "../src/convert-to-aisearch-chat-messages";

describe("convertToAISearchMessages", () => {
	it("converts system, user, and assistant text messages", () => {
		const prompt: LanguageModelV3Prompt = [
			{ role: "system", content: "be brief" },
			{ role: "user", content: [{ type: "text", text: "hello" }] },
			{ role: "assistant", content: [{ type: "text", text: "hi there" }] },
		];

		expect(convertToAISearchMessages(prompt)).toEqual([
			{ role: "system", content: "be brief" },
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi there" },
		]);
	});

	it("stringifies assistant tool calls and tool results", () => {
		const prompt: LanguageModelV3Prompt = [
			{
				role: "assistant",
				content: [
					{ type: "text", text: "calling" },
					{ type: "tool-call", toolCallId: "c1", toolName: "search", input: { q: "x" } },
				],
			},
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "c1",
						toolName: "search",
						output: { type: "text", value: "result text" },
					},
				],
			},
		];

		expect(convertToAISearchMessages(prompt)).toEqual([
			{ role: "assistant", content: 'calling\nTool call search: {"q":"x"}' },
			{ role: "tool", content: "result text" },
		]);
	});

	it("converts image file parts to image_url content", () => {
		const prompt: LanguageModelV3Prompt = [
			{
				role: "user",
				content: [
					{ type: "text", text: "What is in this image?" },
					{ type: "file", mediaType: "image/png", data: "aGVsbG8=" },
				],
			},
		];

		expect(convertToAISearchMessages(prompt)).toEqual([
			{
				role: "user",
				content: [
					{ type: "text", text: "What is in this image?" },
					{ type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
				],
			},
		]);
	});

	it("converts non-image file parts to file content", () => {
		const prompt: LanguageModelV3Prompt = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Summarize this document" },
					{ type: "file", mediaType: "application/pdf", data: "cGRmZGF0YQ==" },
				],
			},
		];

		expect(convertToAISearchMessages(prompt)).toEqual([
			{
				role: "user",
				content: [
					{ type: "text", text: "Summarize this document" },
					{ type: "file", file: { url: "data:application/pdf;base64,cGRmZGF0YQ==" } },
				],
			},
		]);
	});

	it("keeps simple string content when no file parts are present", () => {
		const prompt: LanguageModelV3Prompt = [
			{
				role: "user",
				content: [
					{ type: "text", text: "line one" },
					{ type: "text", text: "line two" },
				],
			},
		];

		expect(convertToAISearchMessages(prompt)).toEqual([
			{ role: "user", content: "line one\nline two" },
		]);
	});
});
