import {
	type LanguageModelV1,
	type LanguageModelV1CallWarning,
	UnsupportedFunctionalityError,
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

export class AutoRAGChatLanguageModel implements LanguageModelV1 {
	readonly specificationVersion = "v1";
	readonly defaultObjectGenerationMode = "json";

	readonly modelId: TextGenerationModels;
	readonly settings: AutoRAGChatSettings;

	private readonly config: AutoRAGChatConfig;

	constructor(
		modelId: TextGenerationModels,
		settings: AutoRAGChatSettings,
		config: AutoRAGChatConfig
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
		frequencyPenalty,
		presencePenalty,
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
		options: Parameters<LanguageModelV1["doGenerate"]>[0]
	): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
		const { args, warnings } = this.getArgs(options);

		const { messages } = convertToWorkersAIChatMessages(options.prompt);

		const output = await this.config.binding.aiSearch({
			query: messages
				.map(({ content, role }) => `${role}: ${content}`)
				.join("\n\n"),
		});

		return {
			text: output.response,
			toolCalls: processToolCalls(output),
			finishReason: "stop", // TODO: mapWorkersAIFinishReason(response.finish_reason),
			rawCall: { rawPrompt: args.messages, rawSettings: args },
			usage: mapWorkersAIUsage(output),
			warnings,
			sources: output.data.map(({ file_id, filename, score }) => ({
				id: file_id,
				sourceType: "url",
				url: filename,
				providerMetadata: {
					attributes: { score },
				},
			})),
		};
	}

	async doStream(
		options: Parameters<LanguageModelV1["doStream"]>[0]
	): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> {
		const { args, warnings } = this.getArgs(options);

		const { messages } = convertToWorkersAIChatMessages(options.prompt);

		const query = messages
			.map(({ content, role }) => `${role}: ${content}`)
			.join("\n\n");

		const response = await this.config.binding.aiSearch({
			query,
			stream: true,
		});

		return {
			stream: getMappedStream(response),
			rawCall: { rawPrompt: args.messages, rawSettings: args },
			warnings,
		};
	}
}
