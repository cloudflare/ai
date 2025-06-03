import {
	type LanguageModelV2,
	type LanguageModelV2CallWarning,
	type LanguageModelV2Content,
	type LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { generateId } from "@ai-sdk/provider-utils";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import type { WorkersAIChatSettings } from "./workersai-chat-settings";
import type { TextGenerationModels } from "./workersai-models";

import { mapWorkersAIUsage } from "./map-workersai-usage";
import { lastMessageWasUser } from "./utils";
import { getMappedStream } from "./streaming";

type WorkersAIChatConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
};

export class WorkersAIChatLanguageModel implements LanguageModelV2 {
	readonly specificationVersion = "v2";
	readonly defaultObjectGenerationMode = "json";

	readonly modelId: TextGenerationModels;
	readonly settings: WorkersAIChatSettings;

	readonly supportedUrls = {
		'image/*': [/^https?:\/\/.*$/],
	};

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

	private async getArgs({
		maxOutputTokens,
		temperature,
		topP,
		frequencyPenalty,
		presencePenalty,
		seed,
		tools,
		toolChoice,
		responseFormat,
	}: Parameters<LanguageModelV2["doGenerate"]>[0]) {
		const warnings: LanguageModelV2CallWarning[] = [];

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

		if (responseFormat != null && responseFormat.type !== 'text') {
			warnings.push({
				type: 'unsupported-setting',
				setting: 'responseFormat',
				details: 'JSON response format is not supported.',
			});
		}


		return {
			args: {
				// model id:
				model: this.modelId,

				// model specific settings:
				safe_prompt: this.settings.safePrompt,

				// standardized settings:
				max_tokens: maxOutputTokens,
				temperature,
				top_p: topP,
				random_seed: seed,
				response_format: responseFormat?.type ?? "text",

				// tools
				tools: tools,
				tool_choice: toolChoice,
			},
			warnings,
		};
	}

	async doGenerate(
		options: Parameters<LanguageModelV2["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV2["doGenerate"]>>> {
		const { args, warnings } = await this.getArgs(options);

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
			{ gateway: this.config.gateway ?? gateway, ...passthroughOptions },
		);

		if (output instanceof ReadableStream) {
			throw new Error("This shouldn't happen");
		}

		const content: Array<LanguageModelV2Content> = [];
		const text = output.response
		if (!!text && text.length > 0) {
			content.push({
				type: "text",
				text,
			});
		}


		// tool calls
		for (const toolCall of output.tool_calls ?? []) {
			content.push({
				type: 'tool-call' as const,
				toolCallType: 'function',
				toolCallId: generateId(),
				toolName: toolCall.name,
				args: toolCall.arguments as string,
			});
		}

		console.log('Workers AI response:', output);


		return {
			content,
			// text:
			// 	typeof output.response === "object" && output.response !== null
			// 		? JSON.stringify(output.response) // ai-sdk expects a string here
			// 		: output.response,
			// toolCalls: processToolCalls(output),
			finishReason: "stop", // TODO: mapWorkersAIFinishReason(response.finish_reason),
			// rawCall: { rawPrompt: messages, rawSettings: args },
			usage: mapWorkersAIUsage(output),
			warnings,
		};
	}

	// async doStream(
	// 	options: Parameters<LanguageModelV2["doStream"]>[0],
	// ): Promise<Awaited<ReturnType<LanguageModelV2["doStream"]>>> {
	// 	const { args, warnings } = await this.getArgs(options);
	//
	// 	// Extract image from messages if present
	// 	const { messages, images } = convertToWorkersAIChatMessages(options.prompt);
	//
	// 	// [1] When the latest message is not a tool response, we use the regular generate function
	// 	// and simulate it as a streamed response in order to satisfy the AI SDK's interface for
	// 	// doStream...
	// 	if (args.tools?.length && lastMessageWasUser(messages)) {
	// 		const response = await this.doGenerate(options);
	//
	// 		if (response instanceof ReadableStream) {
	// 			throw new Error("This shouldn't happen");
	// 		}
	//
	// 		return {
	// 			stream: new ReadableStream<LanguageModelV2StreamPart>({
	// 				async start(controller) {
	// 					if (response.text) {
	// 						controller.enqueue({
	// 							type: "text-delta",
	// 							textDelta: response.text,
	// 						});
	// 					}
	// 					if (response.toolCalls) {
	// 						for (const toolCall of response.toolCalls) {
	// 							controller.enqueue({
	// 								type: "tool-call",
	// 								...toolCall,
	// 							});
	// 						}
	// 					}
	// 					controller.enqueue({
	// 						type: "finish",
	// 						finishReason: "stop",
	// 						usage: response.usage,
	// 					});
	// 					controller.close();
	// 				},
	// 			}),
	// 			rawCall: { rawPrompt: messages, rawSettings: args },
	// 			warnings,
	// 		};
	// 	}
	//
	// 	// [2] ...otherwise, we just proceed as normal and stream the response directly from the remote model.
	// 	const { gateway, ...passthroughOptions } = this.settings;
	//
	// 	// TODO: support for multiple images
	// 	if (images.length !== 0 && images.length !== 1) {
	// 		throw new Error("Multiple images are not yet supported as input");
	// 	}
	//
	// 	const imagePart = images[0];
	//
	// 	const response = await this.config.binding.run(
	// 		args.model,
	// 		{
	// 			messages: messages,
	// 			max_tokens: args.max_tokens,
	// 			stream: true,
	// 			temperature: args.temperature,
	// 			tools: args.tools,
	// 			top_p: args.top_p,
	// 			// Convert Uint8Array to Array of integers for Llama 3.2 Vision model
	// 			// TODO: maybe use the base64 string version?
	// 			...(imagePart ? { image: Array.from(imagePart.image) } : {}),
	// 			// @ts-expect-error response_format not yet added to types
	// 			response_format: args.response_format,
	// 		},
	// 		{ gateway: this.config.gateway ?? gateway, ...passthroughOptions },
	// 	);
	//
	// 	if (!(response instanceof ReadableStream)) {
	// 		throw new Error("This shouldn't happen");
	// 	}
	//
	// 	return {
	// 		stream: getMappedStream(new Response(response)),
	// 		rawCall: { rawPrompt: messages, rawSettings: args },
	// 		warnings,
	// 	};
	// }
	async doStream(
		options: Parameters<LanguageModelV2['doStream']>[0],
	): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
		console.log('doStream called with options:', options);
		const { args, warnings } = await this.getArgs(options);
		const { messages, images } = convertToWorkersAIChatMessages(options.prompt);

		// fallback: simulate streaming with a full generation call
		if (args.tools?.length && lastMessageWasUser(messages)) {
			console.log('Fallback to full generation call for streaming');
			const response = await this.doGenerate(options);

			if (response instanceof ReadableStream) throw new Error('Unexpected stream');

			return {
				stream: new ReadableStream<LanguageModelV2StreamPart>({
					async start(controller) {
						controller.enqueue({ type: 'stream-start', warnings });
						console.log('Starting fallback stream', args);
						console.log('Response from fallback stream:', response);

						if (response.content) {

							controller.enqueue(response.content[0]);
						}


						//@ts-ignore
						if (response.toolCalls) {

							//@ts-ignore
							for (const toolCall of response.toolCalls) {
								controller.enqueue({
									type: 'tool-call',
									toolCallType: 'function',
									toolCallId: toolCall.id ?? crypto.randomUUID(),
									toolName: toolCall.function.name,
									args: toolCall.function.arguments,
								});
							}
						}

						controller.enqueue({
							type: 'finish',
							finishReason: 'stop',
							usage: response.usage ?? {
								inputTokens: undefined,
								outputTokens: undefined,
								totalTokens: undefined,
							},
						});

						controller.close();
					},
				}),
				request: { body: args },
				response: {},
			};
		}

		// real streaming flow from Workers AI
		const imagePart = images[0];

		console.log('Starting Workers AI stream with args:', args, 'and imagePart:', imagePart);
		const response = await this.config.binding.run(
			args.model,
			{
				messages,
				max_tokens: args.max_tokens,
				stream: true,
				temperature: args.temperature,
				tools: args.tools,
				top_p: args.top_p,
				...(imagePart ? { image: Array.from(imagePart.image) } : {}),
				// @ts-expect-error response_format not yet added to types
				response_format: args.response_format,
			},
			{
				gateway: this.config.gateway ?? this.settings.gateway,
			},
		);

		if (!(response instanceof ReadableStream)) {
			throw new Error('Expected a stream from Workers AI');
		}

		console.log('Workers AI stream', args);

		return {
			// stream: response.pipeThrough(
			// 	new TransformStream<Uint8Array, LanguageModelV2StreamPart>({
			// 		start(controller) {
			// 			console.log('Starting Workers AI stream', args);
			// 			controller.enqueue({ type: 'stream-start', warnings });
			// 		},
			// 		async transform(chunk, controller) {
			// 			const text = new TextDecoder().decode(chunk);
			// 			controller.enqueue({ type: 'text', text });
			//
			// 			console.log('Workers AI stream chunk', text);
			// 		},
			// 		flush(controller) {
			// 			console.log('Workers AI stream finished');
			// 			controller.enqueue({
			// 				type: 'finish',
			// 				finishReason: 'stop',
			// 				usage: {
			// 					inputTokens: undefined,
			// 					outputTokens: undefined,
			// 					totalTokens: undefined,
			// 				},
			// 			});
			// 		},
			// 	})
			// ),
			stream: getMappedStream(new Response(response)),
			request: { body: args },
			response: {},
		};
	}
}
