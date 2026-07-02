import type { LanguageModelV4, SharedV4Warning } from "@ai-sdk/provider";

import type { AISearchChatSettings } from "./aisearch-chat-settings";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { getMappedStream, prependStreamStart } from "./streaming";
import { processToolCalls } from "./utils";
import type { TextGenerationModels } from "./workersai-models";

type AISearchChatConfig = {
	provider: string;
	binding: AutoRAG;
	gateway?: GatewayOptions;
};

export class AISearchChatLanguageModel implements LanguageModelV4 {
	readonly specificationVersion = "v4";
	readonly defaultObjectGenerationMode = "json";

	readonly supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>> = {};

	readonly modelId: TextGenerationModels;
	readonly settings: AISearchChatSettings;

	private readonly config: AISearchChatConfig;

	constructor(
		modelId: TextGenerationModels,
		settings: AISearchChatSettings,
		config: AISearchChatConfig,
	) {
		this.modelId = modelId;
		this.settings = settings;
		this.config = config;
	}

	get provider(): string {
		return this.config.provider;
	}

	private getWarnings({
		tools,
		frequencyPenalty,
		presencePenalty,
		responseFormat,
	}: Parameters<LanguageModelV4["doGenerate"]>[0]): SharedV4Warning[] {
		const warnings: SharedV4Warning[] = [];

		if (tools != null && tools.length > 0) {
			console.warn(
				"[workers-ai-provider] Tools are not supported by AI Search. They will be ignored.",
			);
			warnings.push({ feature: "tools", type: "unsupported" });
		}

		if (frequencyPenalty != null) {
			warnings.push({ feature: "frequencyPenalty", type: "unsupported" });
		}

		if (presencePenalty != null) {
			warnings.push({ feature: "presencePenalty", type: "unsupported" });
		}

		if (responseFormat?.type === "json") {
			warnings.push({ feature: "responseFormat", type: "unsupported" });
		}

		return warnings;
	}

	/**
	 * Build the search query from messages.
	 * Flattens the conversation into a single string for aiSearch.
	 */
	private buildQuery(prompt: Parameters<LanguageModelV4["doGenerate"]>[0]["prompt"]): string {
		const { messages } = convertToWorkersAIChatMessages(prompt);
		return messages.map(({ content, role }) => `${role}: ${content}`).join("\n\n");
	}

	async doGenerate(
		options: Parameters<LanguageModelV4["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV4["doGenerate"]>>> {
		const warnings = this.getWarnings(options);
		const query = this.buildQuery(options.prompt);

		const output = await this.config.binding.aiSearch({ query });

		return {
			finishReason: { unified: "stop", raw: "stop" },
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
				...processToolCalls(output as unknown as Record<string, unknown>),
			],
			usage: mapWorkersAIUsage(output as unknown as Record<string, unknown>),
			warnings,
		};
	}

	async doStream(
		options: Parameters<LanguageModelV4["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV4["doStream"]>>> {
		const warnings = this.getWarnings(options);
		const query = this.buildQuery(options.prompt);

		const response = await this.config.binding.aiSearch({
			query,
			stream: true,
		});

		return {
			stream: prependStreamStart(
				getMappedStream(response as unknown as Response | ReadableStream<Uint8Array>),
				warnings,
			),
		};
	}
}
