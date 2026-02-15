import { BaseSummarizeAdapter } from "@tanstack/ai/adapters";
import type { SummarizationOptions, SummarizationResult } from "@tanstack/ai";
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
// Model types
// ---------------------------------------------------------------------------

/**
 * Workers AI models that support summarization.
 */
export type WorkersAiSummarizeModel = "@cf/facebook/bart-large-cnn" | (string & {});

// ---------------------------------------------------------------------------
// WorkersAiSummarizeAdapter
// ---------------------------------------------------------------------------

export class WorkersAiSummarizeAdapter extends BaseSummarizeAdapter<WorkersAiSummarizeModel> {
	readonly name = "workers-ai-summarize" as const;
	private adapterConfig: WorkersAiAdapterConfig;

	constructor(config: WorkersAiAdapterConfig, model: WorkersAiSummarizeModel) {
		super({}, model);
		validateWorkersAiConfig(config);
		this.adapterConfig = config;
	}

	async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
		const { text, maxLength } = options;

		const payload: Record<string, unknown> = { input_text: text };
		if (maxLength != null) payload.max_length = maxLength;

		if (isDirectBindingConfig(this.adapterConfig)) {
			return this.summarizeViaBinding(payload);
		}

		if (isDirectCredentialsConfig(this.adapterConfig)) {
			return this.summarizeViaRest(payload);
		}

		return this.summarizeViaGateway(payload);
	}

	private async summarizeViaBinding(
		payload: Record<string, unknown>,
	): Promise<SummarizationResult> {
		const ai = (this.adapterConfig as WorkersAiDirectBindingConfig).binding;
		const result = (await ai.run(this.model, payload)) as Record<string, unknown>;
		return this.wrapResult((result.summary as string) ?? "");
	}

	private async summarizeViaRest(payload: Record<string, unknown>): Promise<SummarizationResult> {
		const config = this.adapterConfig as WorkersAiDirectCredentialsConfig;
		const response = await workersAiRestFetch(config, this.model, payload, {
			label: "Workers AI summarize",
		});

		const data = (await response.json()) as { result?: { summary?: string } };
		return this.wrapResult(data.result?.summary ?? "");
	}

	private async summarizeViaGateway(
		payload: Record<string, unknown>,
	): Promise<SummarizationResult> {
		const gatewayConfig = this.adapterConfig as AiGatewayAdapterConfig;
		const gatewayFetch = createGatewayFetch("workers-ai", gatewayConfig);

		// The URL here is a placeholder — createGatewayFetch for "workers-ai" extracts
		// the model from the body, sets it as the endpoint, and routes through the gateway.
		// The actual URL path is not used.
		const response = await gatewayFetch("https://api.cloudflare.com/v1/ai/summarization", {
			method: "POST",
			body: JSON.stringify({
				model: this.model,
				...payload,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Workers AI summarize gateway request failed (${response.status}): ${errorText}`,
			);
		}

		const data = (await response.json()) as { result?: { summary?: string }; summary?: string };
		return this.wrapResult(data.result?.summary ?? data.summary ?? "");
	}

	private wrapResult(summary: string): SummarizationResult {
		return {
			id: this.generateId(),
			model: this.model,
			summary,
			// BART-large-CNN doesn't return token usage
			usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
		};
	}
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Creates a Workers AI summarization adapter.
 *
 * Works with TanStack AI's `summarize()` activity function:
 * ```ts
 * import { summarize } from "@tanstack/ai";
 * import { createWorkersAiSummarize } from "@cloudflare/tanstack-ai";
 *
 * const adapter = createWorkersAiSummarize("@cf/facebook/bart-large-cnn", {
 *   binding: env.AI,
 * });
 *
 * const result = await summarize({ adapter, text: "Long article here..." });
 * // result.summary
 * ```
 *
 * Note: Factory takes `(model, config)` for ergonomics — the class constructor
 * uses `(config, model)` to match TanStack AI's upstream convention.
 */
export function createWorkersAiSummarize(
	model: WorkersAiSummarizeModel,
	config: WorkersAiAdapterConfig,
) {
	return new WorkersAiSummarizeAdapter(config, model);
}
