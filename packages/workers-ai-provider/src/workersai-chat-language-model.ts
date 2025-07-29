import type {
	LanguageModelV2,
	LanguageModelV2CallWarning,
	LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import { mapWorkersAIFinishReason } from "./map-workersai-finish-reason";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { getMappedStream } from "./streaming";
import {
	lastMessageWasUser,
	prepareToolsAndToolChoice,
	processText,
	processToolCalls,
} from "./utils";
import type { WorkersAIChatSettings } from "./workersai-chat-settings";
import type { TextGenerationModels } from "./workersai-models";
import { generateId } from "ai";

type WorkersAIChatConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
};

export class WorkersAIChatLanguageModel implements LanguageModelV2 {
	readonly specificationVersion = "v2";
	readonly defaultObjectGenerationMode = "json";

	readonly supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>> = {
		// Empty
	};

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
		responseFormat,
		tools,
		toolChoice,
		maxOutputTokens,
		temperature,
		topP,
		frequencyPenalty,
		presencePenalty,
		seed,
	}: Parameters<LanguageModelV2["doGenerate"]>[0]) {
		const type = responseFormat?.type ?? "text";

		const warnings: LanguageModelV2CallWarning[] = [];

		if (frequencyPenalty != null) {
			warnings.push({
				setting: "frequencyPenalty",
				type: "unsupported-setting",
			});
		}

		if (presencePenalty != null) {
			warnings.push({
				setting: "presencePenalty",
				type: "unsupported-setting",
			});
		}

		const baseArgs = {
			// standardized settings:
			max_tokens: maxOutputTokens,
			// model id:
			model: this.modelId,
			random_seed: seed,

			// model specific settings:
			safe_prompt: this.settings.safePrompt,
			temperature,
			top_p: topP,
		};

		switch (type) {
			case "text": {
				return {
					args: { ...baseArgs, ...prepareToolsAndToolChoice(tools, toolChoice) },
					warnings,
				};
			}

			case "json": {
				return {
					args: {
						...baseArgs,
						response_format: {
							json_schema: responseFormat?.type === "json" && responseFormat.schema,
							type: "json_schema",
						},
						tools: undefined,
					},
					warnings,
				};
			}

			default: {
				const exhaustiveCheck = type satisfies never;
				throw new Error(`Unsupported type: ${exhaustiveCheck}`);
			}
		}
	}

	async doGenerate(
		options: Parameters<LanguageModelV2["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV2["doGenerate"]>>> {
		const { args, warnings } = this.getArgs(options);

		// biome-ignore lint/correctness/noUnusedVariables: this needs to be destructured
		const { gateway, safePrompt, ...passthroughOptions } = this.settings;

		// Extract image from messages if present
		const { messages, images } = convertToWorkersAIChatMessages(options.prompt);

		// TODO: support for multiple images
		if (images.length !== 0 && images.length !== 1) {
			throw new Error("Multiple images are not yet supported as input");
		}

		const imagePart = images[0];

		const output = await this.config.binding.run(
			args.model,
			{
				max_tokens: args.max_tokens,
				messages: messages,
				temperature: args.temperature,
				tools: args.tools,
				top_p: args.top_p,
				// Convert Uint8Array to Array of integers for Llama 3.2 Vision model
				// TODO: maybe use the base64 string version?
				...(imagePart ? { image: Array.from(imagePart.image) } : {}),
				// @ts-expect-error response_format not yet added to types
				response_format: args.response_format,
			},
			{ gateway: this.config.gateway ?? gateway, ...passthroughOptions },
		);

		if (output instanceof ReadableStream) {
			throw new Error("This shouldn't happen");
		}

		return {
			finishReason: mapWorkersAIFinishReason(output),
			// TODO DHRAVYA: rawCall and rawResponse- not sure
			// rawCall: { rawPrompt: messages, rawSettings: args },
			// rawResponse: { body: output },
			content: [
				{
					type: "text",
					text: processText(output) ?? "",
				},
				...processToolCalls(output),
			],
			// @ts-ignore: Missing types
			reasoningText: output?.choices?.[0]?.message?.reasoning_content,
			usage: mapWorkersAIUsage(output),
			warnings,
		};
	}

	async doStream(
		options: Parameters<LanguageModelV2["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV2["doStream"]>>> {
		const { args } = this.getArgs(options);

		// Extract image from messages if present
		const { messages, images } = convertToWorkersAIChatMessages(options.prompt);

		// [1] When the latest message is not a tool response, we use the regular generate function
		// and simulate it as a streamed response in order to satisfy the AI SDK's interface for
		// doStream...
		if (args.tools?.length && lastMessageWasUser(messages)) {
			const response = await this.doGenerate(options);

			if (response instanceof ReadableStream) {
				throw new Error("This shouldn't happen");
			}

			return {
				// rawCall: { rawPrompt: messages, rawSettings: args },
				stream: new ReadableStream<LanguageModelV2StreamPart>({
					async start(controller) {
						for (const contentPart of response.content) {
							if (contentPart.type === "text") {
								controller.enqueue({
									delta: contentPart.text,
									type: "text-delta",
									id: generateId(),
								});
							}
							if (contentPart.type === "tool-call") {
								controller.enqueue(contentPart);
							}
							if (contentPart.type === "reasoning") {
								controller.enqueue({
									type: "reasoning-delta",
									delta: contentPart.text,
									id: generateId(),
								});
							}
						}
						controller.enqueue({
							finishReason: mapWorkersAIFinishReason(response),
							type: "finish",
							usage: response.usage,
						});
						controller.close();
					},
				}),
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
				max_tokens: args.max_tokens,
				messages: messages,
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
			{ gateway: this.config.gateway ?? gateway, ...passthroughOptions },
		);

		if (!(response instanceof ReadableStream)) {
			throw new Error("This shouldn't happen");
		}

		return {
			// TODO DHRAVYA: not sure about rawCalls and warnings inclusino
			// rawCall: { rawPrompt: messages, rawSettings: args },
			stream: getMappedStream(new Response(response)),
			// warnings,
		};
	}
}
