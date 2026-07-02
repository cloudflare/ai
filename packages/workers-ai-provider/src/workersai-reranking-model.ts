import type { RerankingModelV4, SharedV4Warning } from "@ai-sdk/provider";
import { normalizeBindingError } from "./workersai-error";
import type { WorkersAIRerankingSettings } from "./workersai-reranking-settings";
import type { RerankingModels } from "./workersai-models";

export type WorkersAIRerankingConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
};

/**
 * Workers AI reranking model implementing the AI SDK's `RerankingModelV4` interface.
 *
 * Supports BGE reranker models (`@cf/baai/bge-reranker-base`, `bge-reranker-v2-m3`).
 *
 * Workers AI reranking API:
 * - Input: `{ query, contexts: [{ text }], top_k? }`
 * - Output: `{ response: [{ id, score }] }`
 */
export class WorkersAIRerankingModel implements RerankingModelV4 {
	readonly specificationVersion = "v4";

	get provider(): string {
		return this.config.provider;
	}

	constructor(
		readonly modelId: RerankingModels,
		readonly settings: WorkersAIRerankingSettings,
		readonly config: WorkersAIRerankingConfig,
	) {}

	async doRerank(
		options: Parameters<RerankingModelV4["doRerank"]>[0],
	): Promise<Awaited<ReturnType<RerankingModelV4["doRerank"]>>> {
		const { documents, query, topN, abortSignal } = options;

		const warnings: Array<SharedV4Warning> = [];

		// Convert AI SDK documents to Workers AI contexts format
		const contexts = documentsToContexts(documents, warnings);

		// Build Workers AI inputs
		const inputs: Record<string, unknown> = {
			query,
			contexts,
		};
		if (topN != null) {
			inputs.top_k = topN;
		}

		let result: Record<string, unknown>;
		try {
			result = (await this.config.binding.run(
				this.modelId as Parameters<Ai["run"]>[0],
				inputs as Parameters<Ai["run"]>[1],
				{ gateway: this.config.gateway, signal: abortSignal } as AiOptions,
			)) as Record<string, unknown>;
		} catch (error) {
			// Normalize binding failures (e.g. 3040 "out of capacity" → 429) into a
			// retryable APICallError so the AI SDK's maxRetries can engage.
			throw normalizeBindingError(error, {
				model: this.modelId,
				requestBodyValues: inputs,
			});
		}

		// Workers AI returns { response: [{ id, score }] }
		const response = result.response as Array<{ id?: number; score?: number }> | undefined;

		const ranking = (response ?? [])
			.map((item) => ({
				index: item.id ?? 0,
				relevanceScore: item.score ?? 0,
			}))
			.sort((a, b) => b.relevanceScore - a.relevanceScore);

		return {
			ranking,
			warnings,
			response: {
				timestamp: new Date(),
				modelId: this.modelId,
				headers: {},
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert AI SDK document format to Workers AI contexts format.
 *
 * AI SDK supports two document types:
 * - `{ type: 'text', values: string[] }` — direct text strings
 * - `{ type: 'object', values: JSONObject[] }` — JSON objects (stringified for Workers AI)
 */
function documentsToContexts(
	documents: Parameters<RerankingModelV4["doRerank"]>[0]["documents"],
	warnings: Array<SharedV4Warning>,
): Array<{ text: string }> {
	if (documents.type === "text") {
		return documents.values.map((text) => ({ text }));
	}

	// Object documents: stringify each object for the reranker
	warnings.push({
		message: "Workers AI reranker expects text contexts. JSON objects have been stringified.",
		type: "other",
	});

	return documents.values.map((obj) => ({ text: JSON.stringify(obj) }));
}
