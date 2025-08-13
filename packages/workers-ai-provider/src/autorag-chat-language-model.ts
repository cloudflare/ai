import type {
	LanguageModelV2,
	LanguageModelV2CallWarning,
	LanguageModelV2StreamPart,
} from "@ai-sdk/provider";

import type { AutoRAGChatSettings } from "./autorag-chat-settings";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { getMappedStream } from "./streaming";
import { prepareToolsAndToolChoice, processToolCalls } from "./utils";
import type { TextGenerationModels } from "./workersai-models";

type AutoRAGChatConfig = {
	provider: string;
	binding: AutoRAG;
	gateway?: GatewayOptions;
};

export class AutoRAGChatLanguageModel implements LanguageModelV2 {
	readonly specificationVersion = "v2";
	readonly defaultObjectGenerationMode = "json";

	readonly supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>> = {
		// TODO: I think No Supported URLs?
	};

	readonly modelId: TextGenerationModels;
	readonly settings: AutoRAGChatSettings;

	private readonly config: AutoRAGChatConfig;

	constructor(
		modelId: TextGenerationModels,
		settings: AutoRAGChatSettings,
		config: AutoRAGChatConfig,
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
		prompt,
		tools,
		toolChoice,
		frequencyPenalty,
		presencePenalty,
	}: Parameters<LanguageModelV2["doGenerate"]>[0]) {
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
			// messages:
			messages: convertToWorkersAIChatMessages(prompt),
			// model id:
			model: this.modelId,
		};

		const type = responseFormat?.type ?? "text";
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
		const { warnings } = this.getArgs(options);
		const { messages } = convertToWorkersAIChatMessages(options.prompt);

		const output = await this.config.binding.aiSearch({
			query: messages.map(({ content, role }) => `${role}: ${content}`).join("\n\n"),
		});

		return {
			finishReason: "stop",

			content: [
				...output.data.map(({ file_id, filename, score }) => ({
					type: "source" as const,
					sourceType: "url" as const,
					id: file_id,
					url: filename,
					providerMetadata: {
						attributes: { score },
					},
				})),
				{
					type: "text" as const,
					text: output.response,
				},
				...processToolCalls(output),
			],
			usage: mapWorkersAIUsage(output),
			warnings,
		};
	}

	async doStream(
		options: Parameters<LanguageModelV2["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV2["doStream"]>>> {
		const { args, warnings } = this.getArgs(options);
		const { messages } = convertToWorkersAIChatMessages(options.prompt);

		const query = messages.map(({ content, role }) => `${role}: ${content}`).join("\n\n");

		// Get the underlying streaming response (assume this returns a ReadableStream<LanguageModelV2StreamPart>)
		const response = await this.config.binding.aiSearch({
			query,
			stream: true,
		});

		// Create a new stream that first emits the stream-start part with warnings,
		// then pipes through the rest of the response stream
		const stream = new ReadableStream<LanguageModelV2StreamPart>({
			start(controller) {
				// Emit the stream-start part with warnings
				controller.enqueue({
					type: "stream-start",
					warnings: warnings as LanguageModelV2CallWarning[],
				});

				// Pipe the rest of the response stream
				const reader = getMappedStream(response).getReader();

				function push() {
					reader.read().then(({ done, value }) => {
						if (done) {
							controller.close();
							return;
						}
						controller.enqueue(value);
						push();
					});
				}
				push();
			},
		});

		return {
			stream,
			request: {
				body: {
					rawPrompt: args.messages,
					rawSettings: args,
				},
			},
		};
	}
}
