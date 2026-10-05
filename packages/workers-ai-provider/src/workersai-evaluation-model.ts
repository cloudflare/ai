import {
	type Experimental_EvaluationModelV4 as EvaluationModelV4,
	type Experimental_EvaluationModelV4Answer as EvaluationModelV4Answer,
	type Experimental_EvaluationModelV4CallOptions as EvaluationModelV4CallOptions,
	type Experimental_EvaluationModelV4Question as EvaluationModelV4Question,
	type Experimental_EvaluationModelV4Result as EvaluationModelV4Result,
	InvalidResponseDataError,
	type JSONObject,
} from "@ai-sdk/provider";
import { normalizeBindingError } from "./workersai-error";
import type { WorkersAIEvaluationSettings } from "./workersai-evaluation-settings";
import type { EvaluationModels } from "./workersai-models";

export type WorkersAIEvaluationConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
};

/**
 * An image for Clef, as accepted by the Workers AI API: a base64 data URL
 * (`data:image/png;base64,...`) or `{ content_type, base64 }`. Remote URLs are
 * not accepted.
 */
export type WorkersAIEvaluationImage = string | { content_type: string; base64: string };

/**
 * Per-call options, passed via `providerOptions["workers-ai"]`.
 */
export type WorkersAIEvaluationProviderOptions = {
	/** Up to 4 PNG, JPEG, or WebP images placed before the state. */
	images?: WorkersAIEvaluationImage[];
};

/**
 * Clef reports probabilities and scores rounded to 4 decimal places. The AI SDK
 * uses this to widen its distribution-sum and weighted-mean checks.
 */
const CLEF_ROUNDING = { probabilityDecimals: 4, scoreDecimals: 4 };

/**
 * Workers AI evaluation model implementing the AI SDK's experimental
 * `EvaluationModelV4` interface (used by `experimental_evaluate`).
 *
 * Supports Clef decision models (`@cf/cloudflare/clef`, `clef-flash`).
 *
 * Workers AI Clef API:
 * - Input: `{ model, state, questions: { [id]: { type: "noul" | "choice" | "score", instructions, criteria? } }, images? }`
 * - Output: `{ model, answers: { [id]: answer }, usage: { input_tokens, output_tokens } }`
 *
 * The AI SDK calls yes/no questions `boolean`; Clef calls them `noul`.
 */
export class WorkersAIEvaluationModel implements EvaluationModelV4 {
	readonly specificationVersion = "v4";
	readonly supportedQuestionTypes = ["boolean", "choice", "score"] as const;

	get provider(): string {
		return this.config.provider;
	}

	constructor(
		readonly modelId: EvaluationModels,
		readonly settings: WorkersAIEvaluationSettings,
		readonly config: WorkersAIEvaluationConfig,
	) {}

	async doEvaluate(options: EvaluationModelV4CallOptions): Promise<EvaluationModelV4Result> {
		const { state, questions, abortSignal, providerOptions } = options;

		const inputs: Record<string, unknown> = {
			// Clef selects the variant from the body: "clef" or "clef-flash".
			model: this.modelId.split("/").pop(),
			state,
			questions: Object.fromEntries(
				Object.entries(questions).map(([id, question]) => [id, toClefQuestion(question)]),
			),
		};
		const images = (providerOptions?.["workers-ai"] as WorkersAIEvaluationProviderOptions)
			?.images;
		if (images?.length) {
			inputs.images = images;
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

		const rawAnswers = (result.answers ?? {}) as Record<string, ClefAnswer>;
		const answers: Record<string, EvaluationModelV4Answer> = {};
		const answerMetadata: Record<string, JSONObject> = {};
		for (const [id, answer] of Object.entries(rawAnswers)) {
			answers[id] = fromClefAnswer(id, answer, result);
			const metadata: JSONObject = {};
			if ("confidence" in answer && answer.confidence !== undefined) {
				metadata.confidence = answer.confidence;
			}
			if ("legend" in answer && answer.legend !== undefined) {
				metadata.legend = answer.legend;
			}
			if (Object.keys(metadata).length > 0) {
				answerMetadata[id] = metadata;
			}
		}

		const usage = result.usage as { input_tokens?: number; output_tokens?: number } | undefined;

		return {
			answers,
			rounding: CLEF_ROUNDING,
			usage: {
				inputTokens: usage?.input_tokens,
				outputTokens: usage?.output_tokens,
			},
			warnings: [],
			providerMetadata: {
				"workers-ai": { answers: answerMetadata },
			},
			response: {
				timestamp: new Date(),
				modelId: this.modelId,
				headers: {},
				body: result,
			},
		};
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ClefAnswer =
	| { type: "noul"; noul: number }
	| {
			type: "choice";
			choice: string;
			probabilities?: Record<string, number>;
			confidence?: number;
	  }
	| {
			type: "score";
			score: number;
			legend?: JSONObject;
			probabilities?: Record<string, number>;
			confidence?: number;
	  };

/** Convert an AI SDK question to a Clef question (`boolean` → `noul`). */
function toClefQuestion(question: EvaluationModelV4Question): Record<string, unknown> {
	if (question.type === "boolean") {
		return { ...question, type: "noul" };
	}
	return { ...question };
}

/** Convert a Clef answer to an AI SDK answer (`noul` → `boolean`). */
function fromClefAnswer(id: string, answer: ClefAnswer, data: unknown): EvaluationModelV4Answer {
	switch (answer?.type) {
		case "noul":
			return { type: "boolean", probability: answer.noul };
		case "choice":
			return {
				type: "choice",
				choice: answer.choice,
				...(answer.probabilities ? { probabilities: answer.probabilities } : {}),
			};
		case "score":
			return {
				type: "score",
				score: answer.score,
				...(answer.probabilities ? { probabilities: answer.probabilities } : {}),
			};
		default:
			throw new InvalidResponseDataError({
				data,
				message: `Workers AI returned an unsupported answer type for question "${id}": ${JSON.stringify(
					(answer as { type?: unknown } | undefined)?.type,
				)}`,
			});
	}
}
