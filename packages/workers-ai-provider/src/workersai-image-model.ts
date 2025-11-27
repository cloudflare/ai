import type { ImageModelV2 } from "@ai-sdk/provider";
import type { ImageModelV2CallWarning } from "@ai-sdk/provider";
import type { WorkersAIImageConfig } from "./workersai-image-config";
import type { WorkersAIImageSettings } from "./workersai-image-settings";
import type { ImageGenerationModels } from "./workersai-models";

export class WorkersAIImageModel implements ImageModelV2 {
	readonly specificationVersion = "v2";

	get maxImagesPerCall(): number {
		return this.settings.maxImagesPerCall ?? 1;
	}

	get provider(): string {
		return this.config.provider;
	}
	constructor(
		readonly modelId: ImageGenerationModels,
		readonly settings: WorkersAIImageSettings,
		readonly config: WorkersAIImageConfig,
	) {}

	async doGenerate({
		prompt,
		n,
		size,
		aspectRatio,
		seed,
		// headers,
		// abortSignal,
	}: Parameters<ImageModelV2["doGenerate"]>[0]): Promise<
		Awaited<ReturnType<ImageModelV2["doGenerate"]>>
	> {
		const { width, height } = getDimensionsFromSizeString(size);

		const warnings: Array<ImageModelV2CallWarning> = [];

		if (aspectRatio != null) {
			warnings.push({
				details: "This model does not support aspect ratio. Use `size` instead.",
				setting: "aspectRatio",
				type: "unsupported-setting",
			});
		}

		const generateImage = async () => {
			const output = await this.config.binding.run(this.modelId, {
				height,
				prompt,
				seed,
				width,
			});

			return toUint8Array(output as ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer | { image: string });
		};

		const images: Uint8Array[] = await Promise.all(
			Array.from({ length: n }, () => generateImage()),
		);

		// type AiTextToImageOutput = ReadableStream<Uint8Array>;

		return {
			images,
			response: {
				headers: {},
				modelId: this.modelId,
				timestamp: new Date(),
			},
			warnings,
		};
	}
}

function getDimensionsFromSizeString(size: string | undefined) {
	const [width, height] = size?.split("x") ?? [undefined, undefined];

	return {
		height: parseInteger(height),
		width: parseInteger(width),
	};
}

function parseInteger(value?: string) {
	if (value === "" || !value) return undefined;
	const number = Number(value);
	return Number.isInteger(number) ? number : undefined;
}

async function toUint8Array(
	output: ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer | { image: string },
): Promise<Uint8Array> {
	// Already a Uint8Array
	if (output instanceof Uint8Array) {
		return output;
	}

	// ArrayBuffer - wrap it
	if (output instanceof ArrayBuffer) {
		return new Uint8Array(output);
	}

	// REST API response with base64 image
	if (output && typeof output === "object" && "image" in output && typeof output.image === "string") {
		const binaryString = atob(output.image);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes;
	}

	// ReadableStream - read all chunks
	if (output && typeof (output as ReadableStream).getReader === "function") {
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

	throw new Error(`Unexpected output type from image model: ${typeof output}`);
}
