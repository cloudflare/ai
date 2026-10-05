import { APICallError, InvalidResponseDataError } from "@ai-sdk/provider";
import { experimental_evaluate as evaluate } from "ai";
import { describe, expect, it } from "vitest";
import { createWorkersAI } from "../src/index";

const clefResponse = {
	model: "clef",
	answers: {
		urgent: { type: "noul", noul: 0.9731 },
		team: {
			type: "choice",
			choice: "technical",
			confidence: 0.9512,
			probabilities: { billing: 0.0402, technical: 0.9512, sales: 0.0086 },
		},
		severity: {
			type: "score",
			score: 2.6667,
			confidence: 0.6667,
			legend: { "0": "No impact", "1": "Minor", "2": "Major", "3": "Critical" },
			probabilities: { "0": 0, "1": 0, "2": 0.3333, "3": 0.6667 },
		},
	},
	usage: { input_tokens: 412, output_tokens: 0 },
};

const questions = {
	urgent: {
		type: "boolean",
		instructions: "Is this support request urgent?",
	},
	team: {
		type: "choice",
		instructions: "Which team should handle this request?",
		criteria: {
			billing: "Payments, invoices, and refunds",
			technical: "Outages, errors, and configuration",
			sales: "Plans and upgrades",
		},
	},
	severity: {
		type: "score",
		instructions: "How severe is the customer impact?",
		criteria: ["No impact", "Minor", "Major", "Critical"],
	},
} as const;

// ---------------------------------------------------------------------------
// Basic evaluation
// ---------------------------------------------------------------------------

describe("Evaluation - Binding", () => {
	it("should evaluate boolean, choice, and score questions", async () => {
		let capturedModel: string | null = null;
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (model: string, inputs: any) => {
					capturedModel = model;
					capturedInputs = inputs;
					return clefResponse;
				},
			},
		});

		const result = await evaluate({
			model: workersai.evaluation("@cf/cloudflare/clef"),
			state: "Checkout has been failing for every customer for the last hour.",
			questions,
		});

		// Check answers — Clef's `noul` is mapped back to the AI SDK's `boolean`
		expect(result.answers.urgent).toEqual({ type: "boolean", probability: 0.9731 });
		expect(result.answers.team).toEqual({
			type: "choice",
			choice: "technical",
			probabilities: { billing: 0.0402, technical: 0.9512, sales: 0.0086 },
		});
		expect(result.answers.severity).toEqual({
			type: "score",
			score: 2.6667,
			probabilities: { "0": 0, "1": 0, "2": 0.3333, "3": 0.6667 },
		});
		expect(result.usage.inputTokens).toBe(412);
		expect(result.usage.outputTokens).toBe(0);
		expect(result.rounding).toEqual({ probabilityDecimals: 4, scoreDecimals: 4 });

		// Clef-only fields are surfaced as provider metadata
		expect(result.providerMetadata?.["workers-ai"]).toEqual({
			answers: {
				team: { confidence: 0.9512 },
				severity: {
					confidence: 0.6667,
					legend: { "0": "No impact", "1": "Minor", "2": "Major", "3": "Critical" },
				},
			},
		});

		// Check inputs sent to Workers AI — `boolean` is sent as Clef's `noul`
		expect(capturedModel).toBe("@cf/cloudflare/clef");
		expect(capturedInputs).toEqual({
			model: "clef",
			state: "Checkout has been failing for every customer for the last hour.",
			questions: {
				urgent: { type: "noul", instructions: "Is this support request urgent?" },
				team: questions.team,
				severity: questions.severity,
			},
		});
	});

	it("should pass boolean criteria through to noul", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return {
						model: "clef",
						answers: { refund: { type: "noul", noul: 0.12 } },
						usage: {},
					};
				},
			},
		});

		await evaluate({
			model: workersai.evaluation("@cf/cloudflare/clef"),
			state: { order: { id: 42, status: "delivered" } },
			questions: {
				refund: {
					type: "boolean",
					instructions: "Should this order be refunded?",
					criteria: { true: "Issue a refund", false: "Deny the refund" },
				},
			},
		});

		expect(capturedInputs.state).toEqual({ order: { id: 42, status: "delivered" } });
		expect(capturedInputs.questions.refund).toEqual({
			type: "noul",
			instructions: "Should this order be refunded?",
			criteria: { true: "Issue a refund", false: "Deny the refund" },
		});
	});

	it("should select clef-flash from the model id", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return {
						model: "clef-flash",
						answers: { ok: { type: "noul", noul: 0.5 } },
						usage: {},
					};
				},
			},
		});

		await evaluate({
			model: workersai.evaluation("@cf/cloudflare/clef-flash"),
			state: "state",
			questions: { ok: { type: "boolean", instructions: "Is it ok?" } },
		});

		expect(capturedInputs.model).toBe("clef-flash");
	});

	it("should forward images from providerOptions", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return {
						model: "clef",
						answers: { legible: { type: "noul", noul: 0.8 } },
						usage: {},
					};
				},
			},
		});

		const images = [
			"data:image/png;base64,iVBORw0KGgo=",
			{ content_type: "image/jpeg", base64: "/9j/4AAQ" },
		];

		await evaluate({
			model: workersai.evaluation("@cf/cloudflare/clef"),
			state: "Review the attached receipt.",
			questions: {
				legible: { type: "boolean", instructions: "Is the receipt total legible?" },
			},
			providerOptions: { "workers-ai": { images } },
		});

		expect(capturedInputs.images).toEqual(images);
	});

	it("should not send images when none are given", async () => {
		let capturedInputs: any = null;

		const workersai = createWorkersAI({
			binding: {
				run: async (_model: string, inputs: any) => {
					capturedInputs = inputs;
					return {
						model: "clef",
						answers: { ok: { type: "noul", noul: 0.5 } },
						usage: {},
					};
				},
			},
		});

		await evaluate({
			model: workersai.evaluation("@cf/cloudflare/clef"),
			state: "state",
			questions: { ok: { type: "boolean", instructions: "Is it ok?" } },
		});

		expect(capturedInputs).not.toHaveProperty("images");
	});
});

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

describe("Evaluation - Provider", () => {
	it("evaluationModel() is an alias for evaluation()", () => {
		const workersai = createWorkersAI({
			binding: { run: async () => ({}) },
		});

		const e1 = workersai.evaluation("@cf/cloudflare/clef");
		const e2 = workersai.evaluationModel("@cf/cloudflare/clef");

		expect(e1.modelId).toBe(e2.modelId);
		expect(e1.provider).toBe("workersai.evaluation");
		expect(e1.specificationVersion).toBe("v4");
		expect(e1.supportedQuestionTypes).toEqual(["boolean", "choice", "score"]);
	});

	it("throws InvalidResponseDataError for an unknown answer type", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => ({ model: "clef", answers: { q: { type: "rank" } }, usage: {} }),
			},
		});

		const err = await workersai
			.evaluation("@cf/cloudflare/clef")
			.doEvaluate({
				state: "s",
				questions: { q: { type: "boolean", instructions: "q?" } },
			})
			.catch((e) => e);

		expect(InvalidResponseDataError.isInstance(err)).toBe(true);
	});

	it("normalizes an out-of-capacity binding error to a retryable 429 APICallError", async () => {
		const workersai = createWorkersAI({
			binding: {
				run: async () => {
					throw new Error("3040: Capacity temporarily exceeded, please try again.");
				},
			} as any,
		});

		const err = await workersai
			.evaluation("@cf/cloudflare/clef")
			.doEvaluate({
				state: "s",
				questions: { q: { type: "boolean", instructions: "q?" } },
			})
			.catch((e) => e);

		expect(APICallError.isInstance(err)).toBe(true);
		expect((err as APICallError).statusCode).toBe(429);
		expect((err as APICallError).isRetryable).toBe(true);
	});
});
