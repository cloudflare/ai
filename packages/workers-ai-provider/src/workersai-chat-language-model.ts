import type { LanguageModelV3, SharedV3Warning, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { generateId } from "ai";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import { mapWorkersAIFinishReason } from "./map-workersai-finish-reason";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { getMappedStream, prependStreamStart } from "./streaming";
import {
	normalizeMessagesForBinding,
	prepareToolsAndToolChoice,
	processText,
	processToolCalls,
} from "./utils";
import type { WorkersAIChatSettings } from "./workersai-chat-settings";
import type { TextGenerationModels } from "./workersai-models";

type WorkersAIChatConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
	/** True when using a real Workers AI binding (not the REST shim). */
	isBinding: boolean;
};

export class WorkersAIChatLanguageModel implements LanguageModelV3 {
	readonly specificationVersion = "v3";
	readonly defaultObjectGenerationMode = "json";

	readonly supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>> = {};

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
	}: Parameters<LanguageModelV3["doGenerate"]>[0]) {
		const type = responseFormat?.type ?? "text";

		const warnings: SharedV3Warning[] = [];

		if (frequencyPenalty != null) {
			warnings.push({ feature: "frequencyPenalty", type: "unsupported" });
		}

		if (presencePenalty != null) {
			warnings.push({ feature: "presencePenalty", type: "unsupported" });
		}

		const baseArgs = {
			max_tokens: maxOutputTokens,
			model: this.modelId,
			random_seed: seed,
			safe_prompt: this.settings.safePrompt,
			temperature,
			top_p: topP,
		};

		switch (type) {
			case "text": {
				return {
					args: {
						...baseArgs,
						response_format: undefined as
							| { type: string; json_schema?: unknown }
							| undefined,
						...prepareToolsAndToolChoice(tools, toolChoice),
					},
					warnings,
				};
			}

			case "json": {
				return {
					args: {
						...baseArgs,
						response_format: {
							type: "json_schema",
							json_schema:
								responseFormat?.type === "json" ? responseFormat.schema : undefined,
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

	/**
	 * Build the inputs object for `binding.run()`, shared by doGenerate and doStream.
	 */
	private buildRunInputs(
		args: ReturnType<typeof this.getArgs>["args"],
		messages: ReturnType<typeof convertToWorkersAIChatMessages>["messages"],
		images: ReturnType<typeof convertToWorkersAIChatMessages>["images"],
		options?: { stream?: boolean },
	) {
		if (images.length > 1) {
			throw new Error("Multiple images are not yet supported as input");
		}

		const imagePart = images[0];

		// Only normalize messages for the binding path (REST API doesn't need it)
		const finalMessages = this.config.isBinding
			? normalizeMessagesForBinding(messages)
			: messages;

		return {
			max_tokens: args.max_tokens,
			messages: finalMessages,
			temperature: args.temperature,
			tools: args.tools,
			top_p: args.top_p,
			...(imagePart ? { image: Array.from(imagePart.image) } : {}),
			// Only include response_format when actually set
			...(args.response_format ? { response_format: args.response_format } : {}),
			...(options?.stream ? { stream: true } : {}),
		};
	}

	/**
	 * Get passthrough options for binding.run() from settings.
	 */
	private getRunOptions() {
		const { gateway, safePrompt: _safePrompt, ...passthroughOptions } = this.settings;
		return {
			gateway: this.config.gateway ?? gateway,
			...passthroughOptions,
		};
	}

	async doGenerate(
		options: Parameters<LanguageModelV3["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doGenerate"]>>> {
		const { args, warnings } = this.getArgs(options);
		const { messages, images } = convertToWorkersAIChatMessages(options.prompt);

		const inputs = this.buildRunInputs(args, messages, images);
		const runOptions = this.getRunOptions();

		const output = await this.config.binding.run(
			args.model as keyof AiModels,
			inputs,
			runOptions,
		);

		if (output instanceof ReadableStream) {
			throw new Error(
				"Unexpected streaming response from non-streaming request. Check that `stream: true` was not passed.",
			);
		}

		const outputRecord = output as Record<string, unknown>;
		const choices = outputRecord.choices as
			| Array<{ message?: { reasoning_content?: string } }>
			| undefined;
		const reasoningContent = choices?.[0]?.message?.reasoning_content;

		return {
			finishReason: mapWorkersAIFinishReason(outputRecord),
			content: [
				...(reasoningContent
					? [{ type: "reasoning" as const, text: reasoningContent }]
					: []),
				{
					type: "text",
					text: processText(outputRecord) ?? "",
				},
				...processToolCalls(outputRecord),
			],
			usage: mapWorkersAIUsage(output as Record<string, unknown>),
			warnings,
		};
	}

	async doStream(
		options: Parameters<LanguageModelV3["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doStream"]>>> {
		const { args, warnings } = this.getArgs(options);
		const { messages, images } = convertToWorkersAIChatMessages(options.prompt);

		const inputs = this.buildRunInputs(args, messages, images, { stream: true });
		const runOptions = this.getRunOptions();

		const response = await this.config.binding.run(
			args.model as keyof AiModels,
			inputs,
			runOptions,
		);

		// If the binding returned a stream, pipe it through the SSE mapper
		if (response instanceof ReadableStream) {
			return {
				stream: prependStreamStart(getMappedStream(response), warnings),
			};
		}

		// Graceful degradation: some models return a non-streaming response even
		// when stream:true is requested. Wrap the complete response as a stream.
		const outputRecord = response as Record<string, unknown>;
		const choices = outputRecord.choices as
			| Array<{ message?: { reasoning_content?: string } }>
			| undefined;
		const reasoningContent = choices?.[0]?.message?.reasoning_content;

		let textId: string | null = null;
		let reasoningId: string | null = null;

		return {
			stream: new ReadableStream<LanguageModelV3StreamPart>({
				start(controller) {
					controller.enqueue({
						type: "stream-start",
						warnings: warnings as SharedV3Warning[],
					});

					if (reasoningContent) {
						reasoningId = generateId();
						controller.enqueue({ type: "reasoning-start", id: reasoningId });
						controller.enqueue({
							type: "reasoning-delta",
							id: reasoningId,
							delta: reasoningContent,
						});
						controller.enqueue({ type: "reasoning-end", id: reasoningId });
					}

					const text = processText(outputRecord);
					if (text) {
						textId = generateId();
						controller.enqueue({ type: "text-start", id: textId });
						controller.enqueue({ type: "text-delta", id: textId, delta: text });
						controller.enqueue({ type: "text-end", id: textId });
					}

					for (const toolCall of processToolCalls(outputRecord)) {
						controller.enqueue(toolCall);
					}

					controller.enqueue({
						type: "finish",
						finishReason: mapWorkersAIFinishReason(outputRecord),
						usage: mapWorkersAIUsage(response as Record<string, unknown>),
					});
					controller.close();
				},
			}),
		};
	}
}
