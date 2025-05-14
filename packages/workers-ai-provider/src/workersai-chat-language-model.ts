import {
	type LanguageModelV1,
	type LanguageModelV1CallWarning,
	type LanguageModelV1StreamPart,
	UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import type { WorkersAIChatSettings } from "./workersai-chat-settings";
import type { TextGenerationModels } from "./workersai-models";

import { mapWorkersAIUsage } from "./map-workersai-usage";
import { getMappedStream } from "./streaming";
import {
	lastMessageWasUser,
	prepareToolsAndToolChoice,
	processToolCalls,
} from "./utils";

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
		config: WorkersAIChatConfig
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
		options: Parameters<LanguageModelV1["doGenerate"]>[0]
	): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
		const { args, warnings } = this.getArgs(options);

		const { gateway, safePrompt, ...passthroughOptions } = this.settings;

		// Extract image from messages if present
		const { messages, images } = convertToWorkersAIChatMessages(
			options.prompt
		);

		// TODO: support for multiple images
		if (images.length !== 0 && images.length !== 1) {
			throw new Error("Multiple images are not yet supported as input");
		}

		const imagePart = images[0];

		const output = await this.config.binding.run(
			args.model,
			{
				messages: messages,
				max_tokens: args.max_tokens,
				temperature: args.temperature,
				tools: args.tools,
				top_p: args.top_p,
				// Convert Uint8Array to Array of integers for Llama 3.2 Vision model
				// TODO: maybe use the base64 string version?
				...(imagePart ? { image: Array.from(imagePart.image) } : {}),
				// @ts-expect-error response_format not yet added to types
				response_format: args.response_format,
			},
			{ gateway: this.config.gateway ?? gateway, ...passthroughOptions }
		);

		if (output instanceof ReadableStream) {
			throw new Error("This shouldn't happen");
		}

		return {
			text:
				typeof output.response === "object" && output.response !== null
					? JSON.stringify(output.response) // ai-sdk expects a string here
					: output.response,
			toolCalls: processToolCalls(output),
			finishReason: "stop", // TODO: mapWorkersAIFinishReason(response.finish_reason),
			rawCall: { rawPrompt: messages, rawSettings: args },
			usage: mapWorkersAIUsage(output),
			warnings,
		};
	}

	async doStream(
		options: Parameters<LanguageModelV1["doStream"]>[0]
	): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> {
		const { args, warnings } = this.getArgs(options);

		// Extract image from messages if present
		const { messages, images } = convertToWorkersAIChatMessages(
			options.prompt
		);

		// [1] When the latest message is not a tool response, we use the regular generate function
		// and simulate it as a streamed response in order to satisfy the AI SDK's interface for
		// doStream...
		if (args.tools?.length && lastMessageWasUser(messages)) {
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
				rawCall: { rawPrompt: messages, rawSettings: args },
				warnings,
			};
		}

		// [2] ...otherwise, we just proceed as normal and stream the response directly from the remote model.
		const { gateway, ...passthroughOptions } = this.settings;

		// TODO: support for multiple images
		if (images.length !== 0 && images.length !== 1) {
			throw new Error("Multiple images are not yet supported as input");
		}

		const imagePart = images[0];

		const response = await this.config.binding.run(
			args.model,
			{
				messages: messages,
				max_tokens: args.max_tokens,
				stream: true,
				temperature: args.temperature,
				tools: args.tools,
				top_p: args.top_p,
				// Convert Uint8Array to Array of integers for Llama 3.2 Vision model
				// TODO: maybe use the base64 string version?
				...(imagePart ? { image: Array.from(imagePart.image) } : {}),
				// @ts-expect-error response_format not yet added to types
				response_format: args.response_format,
			},
			{ gateway: this.config.gateway ?? gateway, ...passthroughOptions }
		);

		if (!(response instanceof ReadableStream)) {
			throw new Error("This shouldn't happen");
		}

		return {
			stream: getMappedStream(new Response(response)),
			rawCall: { rawPrompt: messages, rawSettings: args },
			warnings,
		};
	}
}
