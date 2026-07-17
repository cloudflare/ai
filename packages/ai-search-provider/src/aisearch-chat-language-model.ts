import type { LanguageModelV3, LanguageModelV3ToolCall } from "@ai-sdk/provider";
import type { AISearchChatSettings } from "./aisearch-chat-settings";
import { convertToAISearchMessages } from "./convert-to-aisearch-chat-messages";
import { mapAISearchFinishReason } from "./map-aisearch-finish-reason";
import { mapAISearchChunkToSource } from "./map-aisearch-source";
import { mapAISearchUsage } from "./map-aisearch-usage";
import { getMappedAISearchStream, prependStreamStart } from "./streaming";

type AISearchChatConfig = {
	provider: string;
	binding: AiSearchInstance;
};

/**
 * Extract tool calls from an OpenAI-compatible chat completion response.
 */
function extractToolCalls(output: Record<string, unknown>): LanguageModelV3ToolCall[] {
	const choices = output.choices as
		| Array<{
				message?: {
					tool_calls?: Array<{
						id?: string;
						function?: { name?: string; arguments?: unknown };
					}>;
				};
		  }>
		| undefined;

	const rawCalls = choices?.[0]?.message?.tool_calls;
	if (!Array.isArray(rawCalls) || rawCalls.length === 0) {
		return [];
	}

	return rawCalls.map((tc) => ({
		type: "tool-call" as const,
		toolCallId: tc.id ?? crypto.randomUUID(),
		toolName: tc.function?.name ?? "",
		input:
			typeof tc.function?.arguments === "string"
				? tc.function.arguments
				: JSON.stringify(tc.function?.arguments ?? {}),
	}));
}

/**
 * Map AI SDK V3 tools and toolChoice to OpenAI-compatible format.
 */
function prepareToolsAndToolChoice(
	tools: Parameters<LanguageModelV3["doGenerate"]>[0]["tools"],
	toolChoice: Parameters<LanguageModelV3["doGenerate"]>[0]["toolChoice"],
) {
	if (tools == null) {
		return { tools: undefined, tool_choice: undefined };
	}

	const mapped = tools.map((tool) => ({
		type: "function" as const,
		function: {
			name: tool.name,
			description: tool.type === "function" ? tool.description : undefined,
			parameters: tool.type === "function" ? tool.inputSchema : undefined,
		},
	}));

	if (toolChoice == null) {
		return { tools: mapped, tool_choice: undefined };
	}

	switch (toolChoice.type) {
		case "auto":
		case "none":
		case "required":
			return { tools: mapped, tool_choice: toolChoice.type };
		case "tool":
			return {
				tools: mapped,
				tool_choice: { type: "function" as const, function: { name: toolChoice.toolName } },
			};
		default:
			throw new Error(`Unsupported tool choice type: ${(toolChoice as { type: string }).type}`);
	}
}

export class AISearchChatLanguageModel implements LanguageModelV3 {
	readonly specificationVersion = "v3";

	readonly supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>> = {};

	readonly modelId: string;
	readonly settings: AISearchChatSettings;

	private readonly config: AISearchChatConfig;

	constructor(modelId: string, settings: AISearchChatSettings, config: AISearchChatConfig) {
		this.modelId = modelId;
		this.settings = settings;
		this.config = config;
	}

	get provider(): string {
		return this.config.provider;
	}

	private buildRequest(
		options: Parameters<LanguageModelV3["doGenerate"]>[0],
		extra?: { stream?: boolean },
	): AiSearchChatCompletionsRequest {
		// `model` and `stream` are handled explicitly below; everything else on
		// settings is forwarded to the binding as-is (see AISearchChatSettings).
		const {
			model,
			stream: _stream,
			...settings
		} = this.settings as AISearchChatSettings & {
			stream?: boolean;
		};

		// The binding type constrains message `content` to `string | null`, but the
		// runtime API accepts structured content arrays for multimodal messages
		// (images, files). The cast is safe — the binding passes the value through.
		const messages = convertToAISearchMessages(options.prompt) as
			AiSearchChatCompletionsRequest["messages"];

		// Map AI SDK tools to OpenAI-compatible tool definitions.
		const { tools, tool_choice } = prepareToolsAndToolChoice(
			options.tools,
			options.toolChoice,
		);

		return {
			...settings,
			messages,
			...(model ? { model } : {}),
			...(extra?.stream ? { stream: true } : {}),
			...(tools ? { tools } : {}),
			...(tool_choice != null ? { tool_choice } : {}),
			...(options.temperature != null ? { temperature: options.temperature } : {}),
			...(options.maxOutputTokens != null ? { max_tokens: options.maxOutputTokens } : {}),
			...(options.topP != null ? { top_p: options.topP } : {}),
			...(options.topK != null ? { top_k: options.topK } : {}),
			...(options.frequencyPenalty != null ? { frequency_penalty: options.frequencyPenalty } : {}),
			...(options.presencePenalty != null ? { presence_penalty: options.presencePenalty } : {}),
			...(options.stopSequences != null ? { stop: options.stopSequences } : {}),
			...(options.seed != null ? { seed: options.seed } : {}),
			...(options.responseFormat?.type === "json" ? { response_format: { type: "json_object" } } : {}),
		};
	}

	async doGenerate(
		options: Parameters<LanguageModelV3["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doGenerate"]>>> {
		const output = await this.config.binding.chatCompletions(this.buildRequest(options));
		const chunks = output.chunks ?? [];
		const messageContent = output.choices?.[0]?.message?.content;
		const toolCalls = extractToolCalls(output as unknown as Record<string, unknown>);

		return {
			finishReason: mapAISearchFinishReason(output),
			content: [
				...chunks.map(mapAISearchChunkToSource),
				...toolCalls,
				{ type: "text" as const, text: messageContent == null ? "" : String(messageContent) },
			],
			usage: mapAISearchUsage(output),
			warnings: [],
		};
	}

	async doStream(
		options: Parameters<LanguageModelV3["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doStream"]>>> {
		// The cast selects the streaming `chatCompletions` overload (which returns a
		// ReadableStream); buildRequest's return type doesn't carry the `stream: true`
		// literal on its own.
		const request = this.buildRequest(options, {
			stream: true,
		}) as AiSearchChatCompletionsRequest & { stream: true };
		const response = await this.config.binding.chatCompletions(request);

		return {
			stream: prependStreamStart(getMappedAISearchStream(response), []),
		};
	}
}
