import {
	type LanguageModelV2,
	type LanguageModelV2CallWarning,
} from "@ai-sdk/provider";

import type { AutoRAGChatSettings } from "./autorag-chat-settings";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { getMappedStream } from "./streaming";
import type { TextGenerationModels } from "./workersai-models";

type AutoRAGChatConfig = {
	provider: string;
	binding: AutoRAG;
	gateway?: GatewayOptions;
};

export class AutoRAGChatLanguageModel implements LanguageModelV2 {
	readonly specificationVersion = "v2";
	readonly defaultObjectGenerationMode = "json";

	readonly modelId: TextGenerationModels;
	readonly settings: AutoRAGChatSettings;

	readonly supportedUrls = {}

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
		prompt,
		frequencyPenalty,
		presencePenalty,
		tools,
		toolChoice,
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

		const baseArgs = {
			// model id:
			model: this.modelId,

			// messages:
			messages: convertToWorkersAIChatMessages(prompt),
		};

		return {
			args: {
				...baseArgs,
				tool_choice: toolChoice,
				tools
			},
			warnings,
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

		//@ts-ignore
		return {
			// content: output.response,
			// toolCalls: processToolCalls(output),
			finishReason: "stop", // TODO: mapWorkersAIFinishReason(response.finish_reason),
			// rawCall: { rawPrompt: args.messages, rawSettings: args },
			usage: mapWorkersAIUsage(output),
			warnings,
			// sources: output.data.map(({ file_id, filename, score }) => ({
			// 	id: file_id,
			// 	sourceType: "url",
			// 	url: filename,
			// 	providerMetadata: {
			// 		attributes: { score },
			// 	},
			// })),
		};
	}

	async doStream(
		options: Parameters<LanguageModelV2["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV2["doStream"]>>> {
		// const { args, warnings } = this.getArgs(options);

		const { messages } = convertToWorkersAIChatMessages(options.prompt);

		const query = messages.map(({ content, role }) => `${role}: ${content}`).join("\n\n");

		const response = await this.config.binding.aiSearch({
			query,
			stream: true,
		});

		return {
			stream: getMappedStream(response),
			// rawCall: { rawPrompt: args.messages, rawSettings: args },
			// warnings,
		};
	}
}
