import {
	type LanguageModelV1,
	type LanguageModelV1CallWarning,
	type LanguageModelV1StreamPart,
	UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import type { WorkersAIChatSettings } from "./workersai-chat-settings";
import type { TextGenerationModels } from "./workersai-models";

import { events } from "fetch-event-stream";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import type { WorkersAIChatPrompt } from "./workersai-chat-prompt";

type WorkersAIChatConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
};

export class WorkersAIChatLanguageModel implements LanguageModelV1 {
	readonly specificationVersion = "v1";
	readonly defaultObjectGenerationMode = "json";

	readonly modelId: TextGenerationModels;
	readonly settings: WorkersAIChatSettings;

	private readonly config: WorkersAIChatConfig;

	constructor(
		modelId: TextGenerationModels,
		settings: WorkersAIChatSettings,
		config: WorkersAIChatConfig,
	) {
		this.modelId = modelId;
		this.settings = settings;
		this.config = config;
	}

	get provider(): string {
		return this.config.provider;
	}

	private getArgs({
		mode,
		prompt,
		maxTokens,
		temperature,
		topP,
		frequencyPenalty,
		presencePenalty,
		seed,
	}: Parameters<LanguageModelV1["doGenerate"]>[0]) {
		const type = mode.type;

		const warnings: LanguageModelV1CallWarning[] = [];

		if (frequencyPenalty != null) {
			warnings.push({
				type: "unsupported-setting",
				setting: "frequencyPenalty",
			});
		}

		if (presencePenalty != null) {
			warnings.push({
				type: "unsupported-setting",
				setting: "presencePenalty",
			});
		}

		const baseArgs = {
			// model id:
			model: this.modelId,

			// model specific settings:
			safe_prompt: this.settings.safePrompt,

			// standardized settings:
			max_tokens: maxTokens,
			temperature,
			top_p: topP,
			random_seed: seed,

			// messages:
			messages: convertToWorkersAIChatMessages(prompt),
		};

		switch (type) {
			case "regular": {
				return {
					args: { ...baseArgs, ...prepareToolsAndToolChoice(mode) },
					warnings,
				};
			}

			case "object-json": {
				return {
					args: {
						...baseArgs,
						response_format: {
							type: "json_schema",
							json_schema: mode.schema,
						},
						tools: undefined,
					},
					warnings,
				};
			}

			case "object-tool": {
				return {
					args: {
						...baseArgs,
						tool_choice: "any",
						tools: [{ type: "function", function: mode.tool }],
					},
					warnings,
				};
			}

			// @ts-expect-error - this is unreachable code
			// TODO: fixme
			case "object-grammar": {
				throw new UnsupportedFunctionalityError({
					functionality: "object-grammar mode",
				});
			}

			default: {
				const exhaustiveCheck = type satisfies never;
				throw new Error(`Unsupported type: ${exhaustiveCheck}`);
			}
		}
	}

	async doGenerate(
		options: Parameters<LanguageModelV1["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
		const { args, warnings } = this.getArgs(options);

		const { gateway, safePrompt, ...passthroughOptions } = this.settings;

		const output = await this.config.binding.run(
			args.model,
			{
				messages: args.messages,
				max_tokens: args.max_tokens,
				temperature: args.temperature,
				tools: args.tools,
				top_p: args.top_p,
				// @ts-expect-error response_format not yet added to types
				response_format: args.response_format,
			},
			{ gateway: this.config.gateway ?? gateway, ...passthroughOptions },
		);

		if (output instanceof ReadableStream) {
			throw new Error("This shouldn't happen");
		}

		return {
			text:
				typeof output.response === "object" && output.response !== null
					? JSON.stringify(output.response) // ai-sdk expects a string here
					: output.response,
			toolCalls: output.tool_calls?.map((toolCall) => ({
				toolCallType: "function",
				toolCallId: toolCall.name,
				toolName: toolCall.name,
				args: JSON.stringify(toolCall.arguments || {}),
			})),
			finishReason: "stop", // TODO: mapWorkersAIFinishReason(response.finish_reason),
			rawCall: { rawPrompt: args.messages, rawSettings: args },
			usage: mapWorkersAIUsage(output),
			warnings,
		};
	}

	async doStream(
		options: Parameters<LanguageModelV1["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> {
		const { args, warnings } = this.getArgs(options);

		// [1] When the latest message is not a tool response, we use the regular generate function
		// and simulate it as a streamed response in order to satisfy the AI SDK's interface for
		// doStream...
		if (args.tools?.length && lastMessageWasUser(args.messages)) {
			const response = await this.doGenerate(options);

			if (response instanceof ReadableStream) {
				throw new Error("This shouldn't happen");
			}

			return {
				stream: new ReadableStream<LanguageModelV1StreamPart>({
					async start(controller) {
						if (response.text) {
							controller.enqueue({
								type: "text-delta",
								textDelta: response.text,
							});
						}
						if (response.toolCalls) {
							for (const toolCall of response.toolCalls) {
								controller.enqueue({
									type: "tool-call",
									...toolCall,
								});
							}
						}
						controller.enqueue({
							type: "finish",
							finishReason: "stop",
							usage: response.usage,
						});
						controller.close();
					},
				}),
				rawCall: { rawPrompt: args.messages, rawSettings: args },
				warnings,
			};
		}

		// [2] ...otherwise, we just proceed as normal and stream the response directly from the remote model.
		const { gateway, ...passthroughOptions } = this.settings;

		const response = await this.config.binding.run(
			args.model,
			{
				messages: args.messages,
				max_tokens: args.max_tokens,
				stream: true,
				temperature: args.temperature,
				tools: args.tools,
				top_p: args.top_p,
				// @ts-expect-error response_format not yet added to types
				response_format: args.response_format,
			},
			{ gateway: this.config.gateway ?? gateway, ...passthroughOptions },
		);

		if (!(response instanceof ReadableStream)) {
			throw new Error("This shouldn't happen");
		}

		const chunkEvent = events(new Response(response));
		let usage = { promptTokens: 0, completionTokens: 0 };

		return {
			stream: new ReadableStream<LanguageModelV1StreamPart>({
				async start(controller) {
					for await (const event of chunkEvent) {
						if (!event.data) {
							continue;
						}
						if (event.data === "[DONE]") {
							break;
						}
						const chunk = JSON.parse(event.data);
						if (chunk.usage) {
							usage = mapWorkersAIUsage(chunk);
						}
						chunk.response?.length &&
							controller.enqueue({
								type: "text-delta",
								textDelta: chunk.response,
							});
					}
					controller.enqueue({
						type: "finish",
						finishReason: "stop",
						usage: usage,
					});
					controller.close();
				},
			}),
			rawCall: { rawPrompt: args.messages, rawSettings: args },
			warnings,
		};
	}
}

function prepareToolsAndToolChoice(
	mode: Parameters<LanguageModelV1["doGenerate"]>[0]["mode"] & {
		type: "regular";
	},
) {
	// when the tools array is empty, change it to undefined to prevent errors:
	const tools = mode.tools?.length ? mode.tools : undefined;

	if (tools == null) {
		return { tools: undefined, tool_choice: undefined };
	}

	const mappedTools = tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			// @ts-expect-error - description is not a property of tool
			description: tool.description,
			// @ts-expect-error - parameters is not a property of tool
			parameters: tool.parameters,
		},
	}));

	const toolChoice = mode.toolChoice;

	if (toolChoice == null) {
		return { tools: mappedTools, tool_choice: undefined };
	}

	const type = toolChoice.type;

	switch (type) {
		case "auto":
			return { tools: mappedTools, tool_choice: type };
		case "none":
			return { tools: mappedTools, tool_choice: type };
		case "required":
			return { tools: mappedTools, tool_choice: "any" };

		// workersAI does not support tool mode directly,
		// so we filter the tools and force the tool choice through 'any'
		case "tool":
			return {
				tools: mappedTools.filter((tool) => tool.function.name === toolChoice.toolName),
				tool_choice: "any",
			};
		default: {
			const exhaustiveCheck = type satisfies never;
			throw new Error(`Unsupported tool choice type: ${exhaustiveCheck}`);
		}
	}
}

function lastMessageWasUser(messages: WorkersAIChatPrompt) {
	return messages.length > 0 && messages[messages.length - 1].role === "user";
}
