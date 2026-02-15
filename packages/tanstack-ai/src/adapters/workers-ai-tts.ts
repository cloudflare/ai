import { BaseTTSAdapter } from "@tanstack/ai/adapters";
import type { TTSOptions, TTSResult } from "@tanstack/ai";
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
import { binaryToBase64, uint8ArrayToBase64 } from "../utils/binary";

// ---------------------------------------------------------------------------
// Model types
// ---------------------------------------------------------------------------

/**
 * Workers AI models that support text-to-speech generation.
 *
 * Note: the typed `AiModels` interface in `@cloudflare/workers-types` may lag
 * behind what's deployed. We use a string union here that matches the known
 * models including Deepgram partner models.
 */
export type WorkersAiTTSModel =
	| "@cf/deepgram/aura-1"
	| "@cf/deepgram/aura-2-en"
	| "@cf/deepgram/aura-2-es"
	| (string & {});

// ---------------------------------------------------------------------------
// WorkersAiTTSAdapter
// ---------------------------------------------------------------------------

export class WorkersAiTTSAdapter extends BaseTTSAdapter<WorkersAiTTSModel> {
	readonly name = "workers-ai-tts" as const;
	private adapterConfig: WorkersAiAdapterConfig;

	constructor(config: WorkersAiAdapterConfig, model: WorkersAiTTSModel) {
		super({}, model);
		validateWorkersAiConfig(config);
		this.adapterConfig = config;
	}

	async generateSpeech(options: TTSOptions): Promise<TTSResult> {
		const { text, voice, format, speed, modelOptions } = options;

		// Workers AI TTS models (Deepgram aura-1) accept { text, lang? }
		const extra: Record<string, unknown> = { ...modelOptions };
		if (voice) extra.voice = voice;
		if (speed != null) extra.speed = speed;

		if (isDirectBindingConfig(this.adapterConfig)) {
			return this.generateViaBinding(text, format, extra);
		}

		if (isDirectCredentialsConfig(this.adapterConfig)) {
			return this.generateViaRest(text, format, extra);
		}

		return this.generateViaGateway(text, format, extra);
	}

	private async generateViaBinding(
		text: string,
		format: string | undefined,
		options: Record<string, unknown>,
	): Promise<TTSResult> {
		const ai = (this.adapterConfig as WorkersAiDirectBindingConfig).binding;
		const result = await ai.run(this.model, { text, ...options });

		return this.normalizeResult(result, format);
	}

	private async generateViaRest(
		text: string,
		format: string | undefined,
		options: Record<string, unknown>,
	): Promise<TTSResult> {
		const config = this.adapterConfig as WorkersAiDirectCredentialsConfig;
		const response = await workersAiRestFetch(
			config,
			this.model,
			{ text, ...options },
			{ label: "Workers AI TTS", signal: (options as { signal?: AbortSignal }).signal },
		);

		// Workers AI TTS returns audio bytes directly
		const buffer = await response.arrayBuffer();
		return this.wrapAudioResult(new Uint8Array(buffer), format);
	}

	private async generateViaGateway(
		text: string,
		format: string | undefined,
		options: Record<string, unknown>,
	): Promise<TTSResult> {
		const gatewayConfig = this.adapterConfig as AiGatewayAdapterConfig;
		const gatewayFetch = createGatewayFetch("workers-ai", gatewayConfig);

		// The URL here is a placeholder — createGatewayFetch for "workers-ai" extracts
		// the model from the body, sets it as the endpoint, and routes through the gateway.
		// The actual URL path is not used.
		const response = await gatewayFetch("https://api.cloudflare.com/v1/audio/speech", {
			method: "POST",
			body: JSON.stringify({
				model: this.model,
				text,
				...options,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Workers AI TTS gateway request failed (${response.status}): ${errorText}`,
			);
		}

		const buffer = await response.arrayBuffer();
		return this.wrapAudioResult(new Uint8Array(buffer), format);
	}

	/**
	 * Normalize binding results. Workers AI TTS can return:
	 * - Uint8Array / ArrayBuffer (raw audio bytes)
	 * - ReadableStream<Uint8Array> (streamed audio bytes)
	 * - { audio: "base64..." } (JSON wrapper)
	 */
	private async normalizeResult(result: unknown, format: string | undefined): Promise<TTSResult> {
		// Use the shared binaryToBase64 helper for Uint8Array/ArrayBuffer/ReadableStream
		// and { audio: "base64..." } JSON wrapper
		const b64 = await binaryToBase64(result, "audio");
		return {
			id: this.generateId(),
			model: this.model,
			audio: b64,
			format: format ?? "mp3",
			contentType: `audio/${format ?? "mp3"}`,
		};
	}

	private wrapAudioResult(bytes: Uint8Array, format: string | undefined): TTSResult {
		return {
			id: this.generateId(),
			model: this.model,
			audio: uint8ArrayToBase64(bytes),
			format: format ?? "mp3",
			contentType: `audio/${format ?? "mp3"}`,
		};
	}
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Creates a Workers AI text-to-speech adapter.
 *
 * Works with TanStack AI's `generateSpeech()` activity function:
 * ```ts
 * import { generateSpeech } from "@tanstack/ai";
 * import { createWorkersAiTts } from "@cloudflare/tanstack-ai";
 *
 * const adapter = createWorkersAiTts(
 *   "@cf/deepgram/aura-1",
 *   { binding: env.AI },
 * );
 *
 * const result = await generateSpeech({ adapter, text: "Hello world" });
 * // result.audio — base64-encoded audio
 * ```
 *
 * Note: Factory takes `(model, config)` for ergonomics — the class constructor
 * uses `(config, model)` to match TanStack AI's upstream convention.
 */
export function createWorkersAiTts(model: WorkersAiTTSModel, config: WorkersAiAdapterConfig) {
	return new WorkersAiTTSAdapter(config, model);
}
