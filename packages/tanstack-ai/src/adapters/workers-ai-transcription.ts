import { BaseTranscriptionAdapter } from "@tanstack/ai/adapters";
import type { TranscriptionOptions, TranscriptionResult } from "@tanstack/ai";
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
import { workersAiRestFetch, workersAiRestFetchBinary } from "../utils/workers-ai-rest";
import { uint8ArrayToBase64 } from "../utils/binary";

// ---------------------------------------------------------------------------
// Model types
// ---------------------------------------------------------------------------

/**
 * Workers AI models that support speech-to-text transcription.
 *
 * Note: the typed `AiModels` interface in `@cloudflare/workers-types` may lag
 * behind what's deployed. We use a string union here that matches the known
 * models including Deepgram partner models.
 *
 * **Nova-3 note:** `@cf/deepgram/nova-3` uses a different input format than the
 * Whisper models. Via binding it accepts `{ audio: { body: base64, contentType } }`.
 * Via REST it requires multipart form data (not JSON). The adapter handles both.
 */
export type WorkersAiTranscriptionModel =
	| "@cf/openai/whisper"
	| "@cf/openai/whisper-tiny-en"
	| "@cf/openai/whisper-large-v3-turbo"
	| "@cf/deepgram/nova-3"
	| (string & {});

// ---------------------------------------------------------------------------
// WorkersAiTranscriptionAdapter
// ---------------------------------------------------------------------------

export class WorkersAiTranscriptionAdapter extends BaseTranscriptionAdapter<WorkersAiTranscriptionModel> {
	readonly name = "workers-ai-transcription" as const;
	private adapterConfig: WorkersAiAdapterConfig;

	constructor(config: WorkersAiAdapterConfig, model: WorkersAiTranscriptionModel) {
		super({}, model);
		validateWorkersAiConfig(config);
		this.adapterConfig = config;
	}

	async transcribe(options: TranscriptionOptions): Promise<TranscriptionResult> {
		const { audio, language, prompt, modelOptions } = options;

		// Normalize audio to raw bytes
		const audioBytes = await normalizeAudioToBytes(audio);

		const extra: Record<string, unknown> = { ...modelOptions };
		if (language) extra.language = language;
		if (prompt) extra.initial_prompt = prompt;

		// Build the model-specific audio payload:
		// - Deepgram Nova-3 (binding): { audio: { body: base64, contentType: "audio/..." } }
		// - Deepgram Nova-3 (REST): multipart FormData (handled separately)
		// - Whisper Large v3 Turbo (REST/gateway): { audio: base64string }
		// - Other Whisper models (binding): { audio: number[] }
		const audioPayload = this.buildAudioPayload(audioBytes, audio);

		if (isDirectBindingConfig(this.adapterConfig)) {
			return this.transcribeViaBinding(audioPayload, extra);
		}

		if (isDirectCredentialsConfig(this.adapterConfig)) {
			// Nova-3 REST requires raw binary audio, not JSON
			if (this.model === "@cf/deepgram/nova-3") {
				return this.transcribeViaRestBinary(audioBytes, audio, extra);
			}
			return this.transcribeViaRest(audioPayload, extra);
		}

		return this.transcribeViaGateway(audioPayload, extra);
	}

	/**
	 * Build the audio field for the request payload, handling model-specific formats.
	 *
	 * - `@cf/deepgram/nova-3` requires `{ body: base64, contentType: "audio/..." }`
	 * - `@cf/openai/whisper-large-v3-turbo` REST/gateway accepts a base64 string
	 * - Other Whisper models accept `number[]` (binding) or base64 (REST)
	 */
	private buildAudioPayload(
		audioBytes: number[],
		originalAudio: string | File | Blob | ArrayBuffer,
	): Record<string, unknown> {
		if (this.model === "@cf/deepgram/nova-3") {
			const b64 = uint8ArrayToBase64(new Uint8Array(audioBytes));
			const contentType = detectAudioContentType(originalAudio);
			return { audio: { body: b64, contentType } };
		}

		if (this.model === "@cf/openai/whisper-large-v3-turbo") {
			return { audio: uint8ArrayToBase64(new Uint8Array(audioBytes)) };
		}

		return { audio: audioBytes };
	}

	private async transcribeViaBinding(
		audioPayload: Record<string, unknown>,
		options: Record<string, unknown>,
	): Promise<TranscriptionResult> {
		const ai = (this.adapterConfig as WorkersAiDirectBindingConfig).binding;
		const result = (await ai.run(this.model, {
			...audioPayload,
			...options,
		})) as Record<string, unknown>;
		return this.normalizeResult(result);
	}

	private async transcribeViaRest(
		audioPayload: Record<string, unknown>,
		options: Record<string, unknown>,
	): Promise<TranscriptionResult> {
		const config = this.adapterConfig as WorkersAiDirectCredentialsConfig;

		const response = await workersAiRestFetch(
			config,
			this.model,
			{ ...audioPayload, ...options },
			{
				label: "Workers AI transcription",
				signal: (options as { signal?: AbortSignal }).signal,
			},
		);

		const data = (await response.json()) as {
			result?: Record<string, unknown>;
		} & Record<string, unknown>;

		// Cloudflare REST API wraps responses in { success, result: {...} }.
		// Use `data.result` when present, fall back to `data` for direct responses.
		return this.normalizeResult(data.result ?? data);
	}

	/**
	 * Transcribe via REST using raw binary audio.
	 * Required for models like Deepgram Nova-3 that expect raw audio bytes
	 * with a Content-Type header (e.g. "audio/wav") instead of JSON.
	 */
	private async transcribeViaRestBinary(
		audioBytes: number[],
		originalAudio: string | File | Blob | ArrayBuffer,
		options: Record<string, unknown>,
	): Promise<TranscriptionResult> {
		const config = this.adapterConfig as WorkersAiDirectCredentialsConfig;
		const contentType = detectAudioContentType(originalAudio);

		const response = await workersAiRestFetchBinary(
			config,
			this.model,
			new Uint8Array(audioBytes),
			contentType,
			{
				label: "Workers AI transcription",
				signal: (options as { signal?: AbortSignal }).signal,
			},
		);

		const data = (await response.json()) as {
			result?: Record<string, unknown>;
		} & Record<string, unknown>;

		return this.normalizeResult(data.result ?? data);
	}

	private async transcribeViaGateway(
		audioPayload: Record<string, unknown>,
		options: Record<string, unknown>,
	): Promise<TranscriptionResult> {
		const gatewayConfig = this.adapterConfig as AiGatewayAdapterConfig;
		const gatewayFetch = createGatewayFetch("workers-ai", gatewayConfig);

		// The URL here is a placeholder — createGatewayFetch for "workers-ai" extracts
		// the model from the body, sets it as the endpoint, and routes through the gateway.
		// The actual URL path is not used.
		const response = await gatewayFetch("https://api.cloudflare.com/v1/audio/transcriptions", {
			method: "POST",
			body: JSON.stringify({
				model: this.model,
				...audioPayload,
				...options,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Workers AI transcription gateway request failed (${response.status}): ${errorText}`,
			);
		}

		const data = (await response.json()) as Record<string, unknown>;
		return this.normalizeResult(data);
	}

	/**
	 * Normalize Workers AI transcription results into the standard
	 * TanStack AI TranscriptionResult shape.
	 *
	 * Handles three response formats:
	 * - Whisper: `{ text, words?, vtt? }`
	 * - Whisper v3-turbo: `{ text, segments?, transcription_info? }`
	 * - Deepgram Nova-3: `{ results: { channels: [{ alternatives: [{ transcript, words }] }] } }`
	 */
	private normalizeResult(raw: Record<string, unknown>): TranscriptionResult {
		// Deepgram Nova-3 format: { results: { channels: [{ alternatives: [{ transcript, words }] }] } }
		const results = raw.results as Record<string, unknown> | undefined;
		if (results?.channels) {
			const channels = results.channels as Array<{
				alternatives?: Array<{
					transcript?: string;
					confidence?: number;
					words?: Array<{ word: string; start: number; end: number; confidence: number }>;
				}>;
			}>;
			const alt = channels?.[0]?.alternatives?.[0];
			const text = alt?.transcript ?? "";
			const result: TranscriptionResult = {
				id: this.generateId(),
				model: this.model,
				text,
			};
			if (alt?.words && Array.isArray(alt.words)) {
				result.words = alt.words.map((w) => ({
					word: w.word ?? "",
					start: w.start ?? 0,
					end: w.end ?? 0,
				}));
			}
			return result;
		}

		// Whisper format: { text, words?, vtt? }
		// Whisper v3-turbo format: { text, segments?, transcription_info? }
		const result: TranscriptionResult = {
			id: this.generateId(),
			model: this.model,
			text: (raw.text as string) ?? "",
		};

		// Language from transcription_info (whisper-large-v3-turbo)
		const transcriptionInfo = raw.transcription_info as Record<string, unknown> | undefined;
		if (transcriptionInfo?.language) {
			result.language = transcriptionInfo.language as string;
		}

		// Duration
		if (transcriptionInfo?.duration != null) {
			result.duration = transcriptionInfo.duration as number;
		}

		// Segments (whisper-large-v3-turbo returns these)
		if (raw.segments && Array.isArray(raw.segments)) {
			result.segments = raw.segments.map((seg: Record<string, unknown>, idx: number) => ({
				id: idx,
				text: (seg.text as string) ?? "",
				start: (seg.start as number) ?? 0,
				end: (seg.end as number) ?? 0,
			}));
		}

		// Words — basic whisper returns top-level words[], v3-turbo nests them in segments
		if (raw.words && Array.isArray(raw.words)) {
			result.words = raw.words.map((w: Record<string, unknown>) => ({
				word: (w.word as string) ?? "",
				start: (w.start as number) ?? 0,
				end: (w.end as number) ?? 0,
			}));
		}

		return result;
	}
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Creates a Workers AI transcription adapter for speech-to-text.
 *
 * Works with TanStack AI's `generateTranscription()` activity function:
 * ```ts
 * import { generateTranscription } from "@tanstack/ai";
 * import { createWorkersAiTranscription } from "@cloudflare/tanstack-ai";
 *
 * const adapter = createWorkersAiTranscription(
 *   "@cf/openai/whisper-large-v3-turbo",
 *   { binding: env.AI },
 * );
 *
 * const result = await generateTranscription({ adapter, audio: audioData });
 * // result.text — the transcribed text
 * ```
 *
 * Note: Factory takes `(model, config)` for ergonomics — the class constructor
 * uses `(config, model)` to match TanStack AI's upstream convention.
 */
export function createWorkersAiTranscription(
	model: WorkersAiTranscriptionModel,
	config: WorkersAiAdapterConfig,
) {
	return new WorkersAiTranscriptionAdapter(config, model);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Normalize various audio input formats into a number[] (raw bytes).
 *
 * Note: `File extends Blob`, so `File` instances are handled by the
 * `instanceof Blob` branch. `Blob.arrayBuffer()` always reads the full
 * contents regardless of any prior reads — there's no cursor to worry about.
 */
async function normalizeAudioToBytes(audio: string | File | Blob | ArrayBuffer): Promise<number[]> {
	if (audio instanceof ArrayBuffer) {
		return Array.from(new Uint8Array(audio));
	}

	if (audio instanceof Blob) {
		// This also handles `File` (which extends Blob)
		const buffer = await audio.arrayBuffer();
		return Array.from(new Uint8Array(buffer));
	}

	if (typeof audio === "string") {
		// Assume base64 string — decode to bytes
		const binary = atob(audio);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return Array.from(bytes);
	}

	throw new Error("Unsupported audio format. Expected string, File, Blob, or ArrayBuffer.");
}

/**
 * Detect the MIME type of the audio input for models that require it
 * (e.g., Deepgram Nova-3).
 *
 * - `File` / `Blob`: use the `.type` property (e.g., "audio/wav")
 * - `ArrayBuffer` / `string`: defaults to "audio/wav"
 */
function detectAudioContentType(audio: string | File | Blob | ArrayBuffer): string {
	// File and Blob carry their own MIME type
	if (audio instanceof Blob && audio.type) {
		return audio.type;
	}

	// For raw bytes, default to audio/wav — this is the most common
	// format for transcription inputs and what the E2E tests use.
	return "audio/wav";
}
