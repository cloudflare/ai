import type { SpeechModelV4, SharedV4Warning } from "@ai-sdk/provider";
import { apiCallErrorFromResponse, normalizeBindingError } from "./workersai-error";
import type { WorkersAISpeechSettings } from "./workersai-speech-settings";
import type { SpeechModels } from "./workersai-models";

export type WorkersAISpeechConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
};

/**
 * Workers AI speech (text-to-speech) model implementing the AI SDK's `SpeechModelV4` interface.
 *
 * Currently supports Deepgram Aura-1 (`@cf/deepgram/aura-1`).
 * The model accepts `{ text, voice?, speed? }` and returns raw audio bytes.
 */
export class WorkersAISpeechModel implements SpeechModelV4 {
	readonly specificationVersion = "v4";

	get provider(): string {
		return this.config.provider;
	}

	constructor(
		readonly modelId: SpeechModels,
		readonly settings: WorkersAISpeechSettings,
		readonly config: WorkersAISpeechConfig,
	) {}

	async doGenerate(
		options: Parameters<SpeechModelV4["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<SpeechModelV4["doGenerate"]>>> {
		const { text, voice, speed, abortSignal } = options;

		const warnings: Array<SharedV4Warning> = [];

		if (options.instructions) {
			warnings.push({
				details: "Workers AI TTS models do not support instructions.",
				feature: "instructions",
				type: "unsupported",
			});
		}

		if (options.outputFormat) {
			warnings.push({
				details:
					"Workers AI TTS models do not support output format selection. Audio is returned as MP3.",
				feature: "outputFormat",
				type: "unsupported",
			});
		}

		// Build inputs for Workers AI TTS
		const inputs: Record<string, unknown> = { text };
		if (voice) inputs.voice = voice;
		if (speed != null) inputs.speed = speed;

		let result: unknown;
		try {
			result = await this.config.binding.run(
				this.modelId as Parameters<Ai["run"]>[0],
				inputs as Parameters<Ai["run"]>[1],
				{
					gateway: this.config.gateway,
					signal: abortSignal,
					// returnRawResponse prevents the createRun REST shim from trying
					// to JSON.parse binary audio. Real env.AI bindings don't recognize
					// this option — it has no effect, and the binding returns the normal
					// binary result (Uint8Array/ReadableStream) which toUint8Array handles.
					returnRawResponse: true,
				} as AiOptions,
			);
		} catch (error) {
			// Normalize binding failures (e.g. 3040 "out of capacity" → 429) into a
			// retryable APICallError so the AI SDK's maxRetries can engage.
			throw normalizeBindingError(error, {
				model: this.modelId,
				requestBodyValues: inputs,
			});
		}

		// The REST shim uses `returnRawResponse`, so it does NOT throw on a non-OK
		// status — it hands back the raw Response. Without this guard the error body
		// would be decoded as "audio". Surface it as a (retryable-aware) APICallError.
		if (result instanceof Response && !result.ok) {
			const errorBody = await result.text().catch(() => "<unable to read response body>");
			throw apiCallErrorFromResponse(result, errorBody, {
				url: `workers-ai:run/${this.modelId}`,
				requestBodyValues: inputs,
			});
		}

		// Workers AI TTS returns binary audio in various formats:
		// - Binding: Uint8Array, ArrayBuffer, ReadableStream, or { audio: base64 }
		// - REST (returnRawResponse): Response object
		const audio = await toUint8Array(result);

		return {
			audio,
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
 * Convert various output types from binding.run() to Uint8Array.
 * Workers AI TTS models return different types depending on the runtime:
 * - Response (from REST shim with returnRawResponse)
 * - ReadableStream<Uint8Array> (most common in workerd)
 * - Uint8Array / ArrayBuffer (direct binary)
 * - { audio: string } with base64 data
 */
async function toUint8Array(output: unknown): Promise<Uint8Array> {
	// Response object (from REST shim with returnRawResponse: true)
	if (output instanceof Response) {
		return new Uint8Array(await output.arrayBuffer());
	}
	if (output instanceof Uint8Array) {
		return output;
	}
	if (output instanceof ArrayBuffer) {
		return new Uint8Array(output);
	}
	if (output instanceof ReadableStream) {
		const reader = (output as ReadableStream<Uint8Array>).getReader();
		const chunks: Uint8Array[] = [];
		let totalLength = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			totalLength += value.length;
		}
		const result = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			result.set(chunk, offset);
			offset += chunk.length;
		}
		return result;
	}
	// Object with audio property (e.g. { audio: base64string })
	if (typeof output === "object" && output !== null) {
		const obj = output as Record<string, unknown>;
		if (typeof obj.audio === "string") {
			return Uint8Array.from(atob(obj.audio), (c) => c.charCodeAt(0));
		}
	}
	throw new Error(
		`Unexpected output type from TTS model. Got ${Object.prototype.toString.call(output)}`,
	);
}
