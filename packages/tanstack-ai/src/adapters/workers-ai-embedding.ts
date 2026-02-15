// TODO: Export from index.ts once TanStack AI adds BaseEmbeddingAdapter.
// This adapter is implemented and tested, but held back from the public API
// to avoid shipping a custom interface that would break when TanStack standardizes it.

import type { AiModels, BaseAiTextEmbeddings } from "@cloudflare/workers-types";
import {
	type WorkersAiAdapterConfig,
	type WorkersAiDirectBindingConfig,
	type WorkersAiDirectCredentialsConfig,
	type AiGatewayAdapterConfig,
	createGatewayFetch,
	isDirectBindingConfig,
	isDirectCredentialsConfig,
	validateWorkersAiConfig,
} from "../utils/create-fetcher";
import { workersAiRestFetch } from "../utils/workers-ai-rest";

// ---------------------------------------------------------------------------
// Model type derived from @cloudflare/workers-types
// ---------------------------------------------------------------------------

export type WorkersAiEmbeddingModel =
	| {
			[K in keyof AiModels]: AiModels[K] extends BaseAiTextEmbeddings ? K : never;
	  }[keyof AiModels]
	| (string & {});

// ---------------------------------------------------------------------------
// WorkersAiEmbeddingAdapter: embeddings via Workers AI
// ---------------------------------------------------------------------------

export interface WorkersAiEmbeddingResult {
	embeddings: number[][];
}

export class WorkersAiEmbeddingAdapter {
	readonly name = "workers-ai-embedding" as const;
	private model: WorkersAiEmbeddingModel;
	private config: WorkersAiAdapterConfig;

	constructor(config: WorkersAiAdapterConfig, model: WorkersAiEmbeddingModel) {
		validateWorkersAiConfig(config);
		this.model = model;
		this.config = config;
	}

	async embed(texts: string[]): Promise<WorkersAiEmbeddingResult> {
		if (isDirectBindingConfig(this.config)) {
			return this.embedViaBinding(texts);
		}

		if (isDirectCredentialsConfig(this.config)) {
			return this.embedViaRest(texts);
		}

		// Gateway mode
		return this.embedViaGateway(texts);
	}

	private async embedViaBinding(texts: string[]): Promise<WorkersAiEmbeddingResult> {
		const ai = (this.config as WorkersAiDirectBindingConfig).binding;
		const result = (await ai.run(this.model, { text: texts })) as {
			shape: number[];
			data: number[][];
		};
		return { embeddings: result.data };
	}

	private async embedViaRest(texts: string[]): Promise<WorkersAiEmbeddingResult> {
		const config = this.config as WorkersAiDirectCredentialsConfig;
		const response = await workersAiRestFetch(
			config,
			this.model,
			{ text: texts },
			{
				label: "Workers AI embedding",
			},
		);

		const json = (await response.json()) as {
			result: { shape: number[]; data: number[][] };
		};
		return { embeddings: json.result.data };
	}

	private async embedViaGateway(texts: string[]): Promise<WorkersAiEmbeddingResult> {
		const gatewayConfig = this.config as AiGatewayAdapterConfig;
		const gatewayFetch = createGatewayFetch("workers-ai", gatewayConfig);

		// The URL here is a placeholder — createGatewayFetch for "workers-ai" extracts
		// the model from the body, sets it as the endpoint, and routes through the gateway.
		// The actual URL path is not used.
		const response = await gatewayFetch("https://api.cloudflare.com/v1/embeddings", {
			method: "POST",
			body: JSON.stringify({
				model: this.model,
				text: texts,
			}),
		});

		// Gateway returns Workers AI native format for embeddings
		const json = (await response.json()) as {
			shape: number[];
			data: number[][];
		};

		return { embeddings: json.data };
	}
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Creates a Workers AI embedding adapter.
 *
 * Note: Factory takes `(model, config)` for ergonomics — the class constructor
 * uses `(config, model)` to match TanStack AI's upstream convention.
 */
export function createWorkersAiEmbedding(
	model: WorkersAiEmbeddingModel,
	config: WorkersAiAdapterConfig,
) {
	return new WorkersAiEmbeddingAdapter(config, model);
}
