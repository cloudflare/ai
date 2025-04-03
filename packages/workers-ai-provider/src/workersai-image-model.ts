import type { ImageModelV1, ImageModelV1CallWarning } from "@ai-sdk/provider";
import type { WorkersAIImageConfig } from "./workersai-image-config";
import type { WorkersAIImageSettings } from "./workersai-image-settings";
import type { ImageGenerationModels } from "./workersai-models";

export class WorkersAIImageModel implements ImageModelV1 {
	readonly specificationVersion = "v1";

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
	}: Parameters<ImageModelV1["doGenerate"]>[0]): Promise<
		Awaited<ReturnType<ImageModelV1["doGenerate"]>>
	> {
		const { width, height } = getDimensionsFromSizeString(size);

		const warnings: Array<ImageModelV1CallWarning> = [];

		if (aspectRatio != null) {
			warnings.push({
				type: "unsupported-setting",
				setting: "aspectRatio",
				details: "This model does not support aspect ratio. Use `size` instead.",
			});
		}

		const generateImage = async () => {
			const outputStream: ReadableStream<Uint8Array> = await this.config.binding.run(
				this.modelId,
				{
					prompt,
					seed,
					width,
					height,
				},
			);

			// Convert the output stream to a Uint8Array.
			return streamToUint8Array(outputStream);
		};

		const images: Uint8Array[] = await Promise.all(
			Array.from({ length: n }, () => generateImage()),
		);

		// type AiTextToImageOutput = ReadableStream<Uint8Array>;

		return {
			images,
			warnings,
			response: {
				timestamp: new Date(),
				modelId: this.modelId,
				headers: {},
			},
		};
	}
}

function getDimensionsFromSizeString(size: string | undefined) {
	const [width, height] = size?.split("x") ?? [undefined, undefined];

	return {
		width: parseInteger(width),
		height: parseInteger(height),
	};
}

function parseInteger(value?: string) {
	if (value === "" || !value) return undefined;
	const number = Number(value);
	return Number.isInteger(number) ? number : undefined;
}

async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let totalLength = 0;

	// Read the stream until it is finished.
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		totalLength += value.length;
	}

	// Allocate a new Uint8Array to hold all the data.
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}
