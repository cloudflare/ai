import type { ImageModelV3, SharedV3Warning } from "@ai-sdk/provider";
import type { WorkersAIImageSettings } from "./workersai-image-settings";
import type { ImageGenerationModels } from "./workersai-models";

export type WorkersAIImageConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
};

export class WorkersAIImageModel implements ImageModelV3 {
	readonly specificationVersion = "v3";

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
	}: Parameters<ImageModelV3["doGenerate"]>[0]): Promise<
		Awaited<ReturnType<ImageModelV3["doGenerate"]>>
	> {
		const { width, height } = getDimensionsFromSizeString(size);

		const warnings: Array<SharedV3Warning> = [];

		if (aspectRatio != null) {
			warnings.push({
				details: "This model does not support aspect ratio. Use `size` instead.",
				feature: "aspectRatio",
				type: "unsupported",
			});
		}

		const generateImage = async () => {
			const output = (await this.config.binding.run(this.modelId as keyof AiModels, {
				height,
				prompt: prompt ?? "",
				seed,
				width,
			})) as unknown;

			return toUint8Array(output);
		};

		const images: Uint8Array[] = await Promise.all(
			Array.from({ length: n }, () => generateImage()),
		);

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

/**
 * Convert various output types from binding.run() to Uint8Array.
 * Workers AI image models return different types depending on the runtime:
 * - ReadableStream<Uint8Array> (most common in workerd)
 * - Uint8Array / ArrayBuffer (direct binary)
 * - Response (needs .arrayBuffer())
 * - { image: string } with base64 data
 */
async function toUint8Array(output: unknown): Promise<Uint8Array> {
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
	// Response object (e.g., from REST shim)
	if (output instanceof Response) {
		return new Uint8Array(await output.arrayBuffer());
	}
	// Object with binary-like properties
	if (typeof output === "object" && output !== null) {
		const obj = output as Record<string, unknown>;
		// { image: base64string }
		if (typeof obj.image === "string") {
			return Uint8Array.from(atob(obj.image), (c) => c.charCodeAt(0));
		}
		// { data: Uint8Array }
		if (obj.data instanceof Uint8Array) {
			return obj.data;
		}
		// { data: ArrayBuffer }
		if (obj.data instanceof ArrayBuffer) {
			return new Uint8Array(obj.data);
		}
		// Try to get a body if it looks response-like
		if (typeof obj.arrayBuffer === "function") {
			return new Uint8Array(await (obj as unknown as Response).arrayBuffer());
		}
	}
	throw new Error(
		`Unexpected output type from image model. Got ${Object.prototype.toString.call(output)} with keys: ${
			typeof output === "object" && output !== null
				? JSON.stringify(Object.keys(output))
				: "N/A"
		}`,
	);
}
