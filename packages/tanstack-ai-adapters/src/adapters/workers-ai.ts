import type { AiModels, BaseAiTextGeneration } from "@cloudflare/workers-types";
import type { StreamChunk, TextOptions } from "@tanstack/ai";
import {
	BaseTextAdapter,
	type StructuredOutputOptions,
	type StructuredOutputResult,
} from "@tanstack/ai/adapters";
import OpenAI from "openai";
import { type AiGatewayAdapterConfig, createGatewayFetch } from "../utils/create-fetcher";

export type WorkersAiTextModel = {
	[K in keyof AiModels]: AiModels[K] extends BaseAiTextGeneration ? K : never;
}[keyof AiModels];

type WorkersAiGatewayConfig = AiGatewayAdapterConfig & { apiKey: string };

export class WorkersAiTextAdapter<TModel extends WorkersAiTextModel> extends BaseTextAdapter<
	TModel,
	any,
	any,
	any
> {
	name = "workers-ai" as const;

	private client: OpenAI;

	constructor(config: AiGatewayAdapterConfig, model: TModel) {
		super({ apiKey: config.apiKey }, model);
		this.client = new OpenAI({
			fetch: createGatewayFetch("workers-ai", config),
			apiKey: config.apiKey,
		});
	}

	async *chatStream(options: TextOptions<any>): AsyncIterable<StreamChunk> {
		const { systemPrompts, messages, tools, temperature, model } = options;

		const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

		if (systemPrompts && systemPrompts.length > 0) {
			openAIMessages.push({
				role: "system",
				content: systemPrompts.join("\n"),
			});
		}

		for (const message of messages) {
			if (message.role === "user") {
				openAIMessages.push({
					role: "user",
					content: this.extractTextContent(message.content),
				});
			} else if (message.role === "assistant") {
				const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
					role: "assistant",
					content: this.extractTextContent(message.content),
				};
				if (message.toolCalls && message.toolCalls.length > 0) {
					assistantMessage.tool_calls = message.toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: {
							name: tc.function.name,
							arguments: tc.function.arguments,
						},
					}));
				}
				openAIMessages.push(assistantMessage);
			} else if (message.role === "tool") {
				let toolContent: string;
				if (typeof message.content === "string") {
					try {
						JSON.parse(message.content);
						toolContent = message.content;
					} catch {
						toolContent = JSON.stringify(message.content);
					}
				} else {
					toolContent = JSON.stringify(message.content);
				}
				openAIMessages.push({
					role: "tool",
					tool_call_id: message.toolCallId || "",
					content: toolContent,
				});
			}
		}

		const openAITools: OpenAI.Chat.ChatCompletionTool[] | undefined = tools
			? tools.map((tool) => ({
					type: "function" as const,
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.inputSchema as Record<string, unknown>,
					},
				}))
			: undefined;

		const stream = await this.client.chat.completions.create({
			model: model || this.model,
			messages: openAIMessages,
			tools: openAITools,
			temperature,
			stream: true,
		});

		const timestamp = Date.now();
		const responseId = `workers-ai-${timestamp}`;
		let accumulatedContent = "";
		const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
		let finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null = null;
		let usage:
			| { promptTokens: number; completionTokens: number; totalTokens: number }
			| undefined;

		for await (const chunk of stream) {
			if (!chunk.choices || chunk.choices.length === 0) continue;
			const choice = chunk.choices[0];
			if (!choice) continue;

			const delta = choice.delta;

			if (delta.content) {
				accumulatedContent += delta.content;
				yield {
					type: "content",
					id: responseId,
					model: model || this.model,
					timestamp,
					delta: delta.content,
					content: accumulatedContent,
					role: "assistant",
				} satisfies StreamChunk;
			}

			if (delta.tool_calls) {
				for (const toolCallDelta of delta.tool_calls) {
					const index = toolCallDelta.index;
					let existing = toolCallsMap.get(index);

					if (!existing) {
						existing = {
							id: toolCallDelta.id || "",
							name: toolCallDelta.function?.name || "",
							arguments: "",
						};
						toolCallsMap.set(index, existing);
					}

					if (toolCallDelta.id) {
						existing.id = toolCallDelta.id;
					}
					if (toolCallDelta.function?.name) {
						existing.name = toolCallDelta.function.name;
					}
					if (toolCallDelta.function?.arguments) {
						existing.arguments += toolCallDelta.function.arguments;
					}
				}
			}

			if (choice.finish_reason) {
				const reason = choice.finish_reason;
				finishReason = reason === "function_call" ? "tool_calls" : reason;
			}

			if (chunk.usage) {
				usage = {
					promptTokens: chunk.usage.prompt_tokens,
					completionTokens: chunk.usage.completion_tokens,
					totalTokens: chunk.usage.total_tokens,
				};
			}
		}

		for (const [index, toolCall] of toolCallsMap) {
			yield {
				type: "tool_call",
				id: responseId,
				model: model || this.model,
				timestamp,
				index,
				toolCall: {
					id: toolCall.id,
					type: "function",
					function: {
						name: toolCall.name,
						arguments: toolCall.arguments,
					},
				},
			} satisfies StreamChunk;
		}

		yield {
			type: "done",
			id: responseId,
			model: model || this.model,
			timestamp,
			finishReason,
			usage,
		} satisfies StreamChunk;
	}

	private extractTextContent(
		content: string | null | Array<{ type: string; content?: string }>,
	): string {
		if (content === null) return "";
		if (typeof content === "string") return content;
		return content
			.filter((p) => p.type === "text")
			.map((p) => p.content || "")
			.join("");
	}

	async structuredOutput(
		options: StructuredOutputOptions<any>,
	): Promise<StructuredOutputResult<unknown>> {
		const { outputSchema, chatOptions } = options;
		const { systemPrompts, messages, temperature, model } = chatOptions;

		const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

		if (systemPrompts && systemPrompts.length > 0) {
			openAIMessages.push({
				role: "system",
				content: systemPrompts.join("\n"),
			});
		}

		for (const message of messages) {
			if (message.role === "user") {
				openAIMessages.push({
					role: "user",
					content: this.extractTextContent(message.content),
				});
			} else if (message.role === "assistant") {
				openAIMessages.push({
					role: "assistant",
					content: this.extractTextContent(message.content),
				});
			}
		}

		const response = await this.client.chat.completions.create({
			model: model || this.model,
			messages: openAIMessages,
			temperature,
			stream: false,
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "structured_output",
					strict: true,
					schema: outputSchema,
				},
			},
		});

		const choice = response.choices?.[0];

		if (!choice) {
			console.error("No choices in response:", JSON.stringify(response));
			return { data: null, rawText: "" };
		}

		const rawText = choice.message?.content || "";

		let data: unknown;
		try {
			data = JSON.parse(rawText);
		} catch {
			data = rawText;
		}

		return { data, rawText };
	}
}

export function createWorkersAiChat(model: WorkersAiTextModel, config: WorkersAiGatewayConfig) {
	return new WorkersAiTextAdapter(config, model);
}
