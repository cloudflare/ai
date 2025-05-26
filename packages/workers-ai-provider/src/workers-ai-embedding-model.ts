import { TooManyEmbeddingValuesForCallError, type EmbeddingModelV2 } from "@ai-sdk/provider";
import type { StringLike } from "./utils";
import type { EmbeddingModels } from "./workersai-models";

export type WorkersAIEmbeddingConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
};

export type WorkersAIEmbeddingSettings = {
	gateway?: GatewayOptions;
	maxEmbeddingsPerCall?: number;
	supportsParallelCalls?: boolean;
} & {
	/**
	 * Arbitrary provider-specific options forwarded unmodified.
	 */
	[key: string]: StringLike;
};

export class WorkersAIEmbeddingModel implements EmbeddingModelV2<string> {
	/**
	 * Semantic version of the {@link EmbeddingModelV2} specification implemented
	 * by this class. It never changes.
	 */
	readonly specificationVersion = "v2";
	readonly modelId: EmbeddingModels;
	private readonly config: WorkersAIEmbeddingConfig;
	private readonly settings: WorkersAIEmbeddingSettings;

	/**
	 * Provider name exposed for diagnostics and error reporting.
	 */
	get provider(): string {
		return this.config.provider;
	}

	get maxEmbeddingsPerCall(): number {
		// https://developers.cloudflare.com/workers-ai/platform/limits/#text-embeddings
		const maxEmbeddingsPerCall = this.modelId === "@cf/baai/bge-large-en-v1.5" ? 1500 : 3000;
		return this.settings.maxEmbeddingsPerCall ?? maxEmbeddingsPerCall;
	}

	get supportsParallelCalls(): boolean {
		return this.settings.supportsParallelCalls ?? true;
	}

	constructor(
		modelId: EmbeddingModels,
		settings: WorkersAIEmbeddingSettings,
		config: WorkersAIEmbeddingConfig,
	) {
		this.modelId = modelId;
		this.settings = settings;
		this.config = config;
	}

	async doEmbed({
		values,
	}: Parameters<EmbeddingModelV2<string>["doEmbed"]>[0]): Promise<
		Awaited<ReturnType<EmbeddingModelV2<string>["doEmbed"]>>
	> {
		if (values.length > this.maxEmbeddingsPerCall) {
			throw new TooManyEmbeddingValuesForCallError({
				provider: this.provider,
				modelId: this.modelId,
				maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
				values,
			});
		}

		const { gateway, ...passthroughOptions } = this.settings;

		const response = await this.config.binding.run(
			this.modelId,
			{
				text: values,
			},
			{ gateway: this.config.gateway ?? gateway, ...passthroughOptions },
		);

		return {
			embeddings: response.data,
		};
	}
}
