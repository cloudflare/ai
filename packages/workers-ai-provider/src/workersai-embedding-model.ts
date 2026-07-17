import type {
	EmbeddingModelV4,
	EmbeddingModelV4CallOptions,
	EmbeddingModelV4Result,
} from "@ai-sdk/provider";
import { TooManyEmbeddingValuesForCallError } from "@ai-sdk/provider";
import { normalizeBindingError } from "./workersai-error";
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

	/**
	 * Passthrough settings that are provided directly to the run function.
	 */
	[key: string]: unknown;
};

export class WorkersAIEmbeddingModel implements EmbeddingModelV4 {
	readonly specificationVersion = "v4";
	readonly modelId: EmbeddingModels;
	private readonly config: WorkersAIEmbeddingConfig;
	private readonly settings: WorkersAIEmbeddingSettings;

	get provider(): string {
		return this.config.provider;
	}

	get maxEmbeddingsPerCall(): number {
		// https://developers.cloudflare.com/workers-ai/platform/limits/#text-embeddings
		return this.settings.maxEmbeddingsPerCall ?? 3000;
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
		abortSignal,
	}: EmbeddingModelV4CallOptions): Promise<EmbeddingModelV4Result> {
		if (values.length > this.maxEmbeddingsPerCall) {
			throw new TooManyEmbeddingValuesForCallError({
				maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
				modelId: this.modelId,
				provider: this.provider,
				values,
			});
		}

		const {
			gateway,
			maxEmbeddingsPerCall: _maxEmbeddingsPerCall,
			supportsParallelCalls: _supportsParallelCalls,
			...passthroughOptions
		} = this.settings;

		let response: unknown;
		try {
			response = await this.config.binding.run(
				this.modelId as keyof AiModels,
				{
					text: values,
				},
				{
					gateway: this.config.gateway ?? gateway,
					signal: abortSignal,
					...passthroughOptions,
				} as AiOptions,
			);
		} catch (error) {
			// Normalize binding failures (e.g. 3040 "out of capacity" → 429) into a
			// retryable APICallError so the AI SDK's maxRetries can engage.
			throw normalizeBindingError(error, {
				model: this.modelId,
				requestBodyValues: { text: values },
			});
		}

		return {
			embeddings: (response as { data: number[][] }).data,
			warnings: [],
		};
	}
}
