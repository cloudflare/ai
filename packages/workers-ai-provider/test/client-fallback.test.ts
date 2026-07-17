import type { LanguageModelV4, LanguageModelV4StreamResult } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { createClientFallbackModel, type FallbackLeg } from "../src/client-fallback";
import { WorkersAIFallbackError, WorkersAIGatewayError } from "../src/errors";

function stubModel(modelId: string, behavior: { ok: true } | { throw: unknown }): LanguageModelV4 {
	const result = { stream: new ReadableStream() } as unknown as LanguageModelV4StreamResult;
	return {
		specificationVersion: "v4",
		provider: "stub",
		modelId,
		supportedUrls: {},
		doGenerate: vi.fn(async () => {
			if ("throw" in behavior) throw behavior.throw;
			return { content: [] } as never;
		}),
		doStream: vi.fn(async () => {
			if ("throw" in behavior) throw behavior.throw;
			return result;
		}),
	};
}

function leg(slug: string, model: LanguageModelV4): FallbackLeg {
	return { slug, model, transport: "run" };
}

const opts = {} as never;

describe("createClientFallbackModel", () => {
	it("returns the first model's result when it succeeds", async () => {
		const a = stubModel("openai/gpt-5", { ok: true });
		const b = stubModel("openai/gpt-5-mini", { ok: true });
		const model = createClientFallbackModel([
			leg("openai/gpt-5", a),
			leg("openai/gpt-5-mini", b),
		]);
		await model.doStream(opts);
		expect(a.doStream).toHaveBeenCalledOnce();
		expect(b.doStream).not.toHaveBeenCalled();
	});

	it("falls through to the next leg when the first dispatch fails", async () => {
		const a = stubModel("openai/gpt-5", { throw: new Error("upstream down") });
		const b = stubModel("openai/gpt-5-mini", { ok: true });
		const model = createClientFallbackModel([
			leg("openai/gpt-5", a),
			leg("openai/gpt-5-mini", b),
		]);
		await model.doStream(opts);
		expect(a.doStream).toHaveBeenCalledOnce();
		expect(b.doStream).toHaveBeenCalledOnce();
	});

	it("throws WorkersAIFallbackError with the full attempt tree when all legs fail", async () => {
		const a = stubModel("openai/gpt-5", {
			throw: new WorkersAIGatewayError("rate-limit", "429", {
				status: 429,
				recoverable: true,
			}),
		});
		const b = stubModel("openai/gpt-5-mini", { throw: new Error("nope") });
		const model = createClientFallbackModel([
			leg("openai/gpt-5", a),
			leg("openai/gpt-5-mini", b),
		]);

		await expect(model.doStream(opts)).rejects.toBeInstanceOf(WorkersAIFallbackError);
		try {
			await model.doStream(opts);
		} catch (e) {
			const err = e as WorkersAIFallbackError;
			expect(err.attempts).toHaveLength(2);
			expect(err.attempts[0]).toMatchObject({
				model: "openai/gpt-5",
				ok: false,
				status: 429,
			});
			expect(err.attempts[1]).toMatchObject({ model: "openai/gpt-5-mini", ok: false });
			expect(err.lastError?.message).toBe("nope");
		}
	});

	it("wraps non-typed errors as recoverable gateway errors", async () => {
		const a = stubModel("openai/gpt-5", { throw: new Error("socket reset") });
		const b = stubModel("openai/gpt-5-mini", { ok: true });
		const model = createClientFallbackModel([
			leg("openai/gpt-5", a),
			leg("openai/gpt-5-mini", b),
		]);
		await model.doGenerate(opts);
		expect(b.doGenerate).toHaveBeenCalledOnce();
	});

	it("throws when constructed with no legs", () => {
		expect(() => createClientFallbackModel([])).toThrow(/at least one model leg/);
	});
});
