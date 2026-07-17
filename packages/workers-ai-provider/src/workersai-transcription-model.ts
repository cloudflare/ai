import type { TranscriptionModelV4, SharedV4Warning } from "@ai-sdk/provider";
import type { WorkersAITranscriptionSettings } from "./workersai-transcription-settings";
import type { TranscriptionModels } from "./workersai-models";
import { createRunBinary, type CreateRunConfig } from "./utils";
import { normalizeBindingError } from "./workersai-error";

export type WorkersAITranscriptionConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
	/**
	 * Whether the binding is a real `env.AI` binding (true) or a REST shim (false).
	 * Nova-3 uses different upload paths depending on this.
	 */
	isBinding: boolean;
	/**
	 * REST credentials, only set when `isBinding` is false.
	 * Needed for Nova-3 which requires binary upload, bypassing the JSON-based REST shim.
	 */
	credentials?: CreateRunConfig;
};

/**
 * Workers AI transcription model implementing the AI SDK's `TranscriptionModelV4` interface.
 *
 * Supports:
 * - Whisper models (`@cf/openai/whisper`, `whisper-tiny-en`, `whisper-large-v3-turbo`)
 * - Deepgram Nova-3 (`@cf/deepgram/nova-3`) — uses a different input/output format
 */
export class WorkersAITranscriptionModel implements TranscriptionModelV4 {
	readonly specificationVersion = "v4";

	get provider(): string {
		return this.config.provider;
	}

	constructor(
		readonly modelId: TranscriptionModels,
		readonly settings: WorkersAITranscriptionSettings,
		readonly config: WorkersAITranscriptionConfig,
	) {}

	async doGenerate(
		options: Parameters<TranscriptionModelV4["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<TranscriptionModelV4["doGenerate"]>>> {
		const { audio, mediaType, abortSignal } = options;

		const warnings: Array<SharedV4Warning> = [];

		// The AI SDK always converts audio to Uint8Array via
		// convertDataContentToUint8Array before calling doGenerate.
		const audioBytes =
			typeof audio === "string"
				? Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))
				: audio;

		const isNova3 = this.modelId === "@cf/deepgram/nova-3";

		let rawResult: unknown;

		try {
			if (isNova3) {
				rawResult = await this.runNova3(audioBytes, mediaType, abortSignal);
			} else {
				rawResult = await this.runWhisper(audioBytes, abortSignal);
			}
		} catch (error) {
			// Normalize binding failures (e.g. 3040 "out of capacity" → 429) into a
			// retryable APICallError so the AI SDK's maxRetries can engage. The
			// REST binary path already throws an APICallError, which passes through.
			throw normalizeBindingError(error, {
				model: this.modelId,
				requestBodyValues: { mediaType },
			});
		}

		const result = rawResult as Record<string, unknown>;

		// Normalize response into AI SDK format
		if (isNova3) {
			return this.normalizeNova3Response(result, warnings);
		}
		return this.normalizeWhisperResponse(result, warnings);
	}

	// ---------------------------------------------------------------------------
	// Whisper models
	// ---------------------------------------------------------------------------

	private async runWhisper(audioBytes: Uint8Array, abortSignal?: AbortSignal): Promise<unknown> {
		// whisper-large-v3-turbo requires base64 audio (both binding and REST).
		// Other Whisper models accept number[].
		const modelStr = this.modelId as string;
		const audio =
			modelStr === "@cf/openai/whisper-large-v3-turbo"
				? uint8ArrayToBase64(audioBytes)
				: Array.from(audioBytes);

		const inputs: Record<string, unknown> = { audio };

		if (this.settings.language) {
			inputs.language = this.settings.language;
		}
		if (this.settings.prompt) {
			inputs.initial_prompt = this.settings.prompt;
		}

		return this.config.binding.run(
			this.modelId as Parameters<Ai["run"]>[0],
			inputs as Parameters<Ai["run"]>[1],
			{ gateway: this.config.gateway, signal: abortSignal } as AiOptions,
		);
	}

	private normalizeWhisperResponse(
		raw: Record<string, unknown>,
		warnings: Array<SharedV4Warning>,
	): Awaited<ReturnType<TranscriptionModelV4["doGenerate"]>> {
		const text = (raw.text as string) ?? "";

		// Build segments from Whisper's various formats
		const segments: Array<{ text: string; startSecond: number; endSecond: number }> = [];

		// whisper-large-v3-turbo returns segments[]
		if (raw.segments && Array.isArray(raw.segments)) {
			for (const seg of raw.segments) {
				segments.push({
					text: ((seg as Record<string, unknown>).text as string) ?? "",
					startSecond: ((seg as Record<string, unknown>).start as number) ?? 0,
					endSecond: ((seg as Record<string, unknown>).end as number) ?? 0,
				});
			}
		}
		// basic whisper returns words[]
		else if (raw.words && Array.isArray(raw.words)) {
			for (const w of raw.words) {
				segments.push({
					text: ((w as Record<string, unknown>).word as string) ?? "",
					startSecond: ((w as Record<string, unknown>).start as number) ?? 0,
					endSecond: ((w as Record<string, unknown>).end as number) ?? 0,
				});
			}
		}

		// Language and duration from transcription_info (v3-turbo)
		const info = raw.transcription_info as Record<string, unknown> | undefined;

		return {
			text,
			segments,
			language: (info?.language as string) ?? undefined,
			durationInSeconds: (info?.duration as number) ?? undefined,
			warnings,
			response: {
				timestamp: new Date(),
				modelId: this.modelId,
				headers: {},
			},
		};
	}

	// ---------------------------------------------------------------------------
	// Deepgram Nova-3
	// ---------------------------------------------------------------------------

	private async runNova3(
		audioBytes: Uint8Array,
		mediaType: string,
		abortSignal?: AbortSignal,
	): Promise<unknown> {
		if (this.config.isBinding) {
			// Binding path: Nova-3 accepts { audio: { body: base64, contentType } }
			return this.config.binding.run(
				this.modelId as Parameters<Ai["run"]>[0],
				{
					audio: { body: uint8ArrayToBase64(audioBytes), contentType: mediaType },
				} as Parameters<Ai["run"]>[1],
				{ gateway: this.config.gateway, signal: abortSignal } as AiOptions,
			);
		}

		// REST path: Nova-3 requires raw binary with a Content-Type header,
		// not JSON. The createRun shim always sends JSON, so we bypass it
		// and use createRunBinary which sends the audio bytes directly.
		if (!this.config.credentials) {
			throw new Error(
				"Nova-3 transcription via REST requires credentials in the config. " +
					"This is a bug — credentials should have been set by createWorkersAI.",
			);
		}
		return createRunBinary(
			this.config.credentials,
			this.modelId,
			audioBytes,
			mediaType,
			abortSignal,
		);
	}

	private normalizeNova3Response(
		raw: Record<string, unknown>,
		warnings: Array<SharedV4Warning>,
	): Awaited<ReturnType<TranscriptionModelV4["doGenerate"]>> {
		// Nova-3 format: { results: { channels: [{ alternatives: [{ transcript, words }] }] } }
		const results = raw.results as Record<string, unknown> | undefined;
		const channels = results?.channels as
			| Array<{
					alternatives?: Array<{
						transcript?: string;
						confidence?: number;
						words?: Array<{ word: string; start: number; end: number }>;
					}>;
			  }>
			| undefined;
		const alt = channels?.[0]?.alternatives?.[0];

		const text = alt?.transcript ?? "";
		const segments: Array<{ text: string; startSecond: number; endSecond: number }> = [];

		if (alt?.words && Array.isArray(alt.words)) {
			for (const w of alt.words) {
				segments.push({
					text: w.word ?? "",
					startSecond: w.start ?? 0,
					endSecond: w.end ?? 0,
				});
			}
		}

		return {
			text,
			segments,
			language: undefined,
			durationInSeconds: undefined,
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

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}
