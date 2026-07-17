import type { LanguageModelV3StreamPart, SharedV3Warning } from "@ai-sdk/provider";
import { mapAISearchFinishReason } from "./map-aisearch-finish-reason";
import { type AISearchChunk, mapAISearchChunkToSource } from "./map-aisearch-source";
import { mapAISearchUsage } from "./map-aisearch-usage";

type SSEEvent = {
	event?: string;
	data: string;
};

function createId(): string {
	return `aisearch-${crypto.randomUUID()}`;
}

function createEmptyUsage() {
	return mapAISearchUsage({});
}

class SSEEventDecoder extends TransformStream<Uint8Array, SSEEvent> {
	constructor() {
		let buffer = "";
		let eventName: string | undefined;
		let dataLines: string[] = [];
		const decoder = new TextDecoder();

		const dispatch = (controller: TransformStreamDefaultController<SSEEvent>) => {
			if (dataLines.length > 0) {
				controller.enqueue({ event: eventName, data: dataLines.join("\n") });
			}
			eventName = undefined;
			dataLines = [];
		};

		const processLine = (
			line: string,
			controller: TransformStreamDefaultController<SSEEvent>,
		) => {
			const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
			if (normalized === "") {
				dispatch(controller);
				return;
			}

			if (normalized.startsWith("event:")) {
				eventName = normalized.slice(6).trim();
				return;
			}

			if (normalized.startsWith("data:")) {
				const data = normalized.slice(5);
				dataLines.push(data.startsWith(" ") ? data.slice(1) : data);
			}
		};

		super({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					processLine(line, controller);
				}
			},

			flush(controller) {
				buffer += decoder.decode();
				if (buffer.length > 0) {
					processLine(buffer, controller);
				}
				dispatch(controller);
			},
		});
	}
}

export function prependStreamStart(
	source: ReadableStream<LanguageModelV3StreamPart>,
	warnings: SharedV3Warning[],
): ReadableStream<LanguageModelV3StreamPart> {
	let sentStart = false;
	return source.pipeThrough(
		new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
			transform(chunk, controller) {
				if (!sentStart) {
					sentStart = true;
					controller.enqueue({ type: "stream-start", warnings });
				}
				controller.enqueue(chunk);
			},
			flush(controller) {
				if (!sentStart) {
					controller.enqueue({ type: "stream-start", warnings });
				}
			},
		}),
	);
}

export function getMappedAISearchStream(
	response: Response | ReadableStream<Uint8Array>,
): ReadableStream<LanguageModelV3StreamPart> {
	const rawStream =
		response instanceof ReadableStream
			? response
			: (response.body as ReadableStream<Uint8Array> | null);

	if (!rawStream) {
		throw new Error("No readable stream available for SSE parsing.");
	}

	let usage = createEmptyUsage();
	let textId: string | null = null;
	let finishReason = mapAISearchFinishReason(undefined);
	let receivedAnyData = false;
	let receivedDone = false;

	return rawStream.pipeThrough(new SSEEventDecoder()).pipeThrough(
		new TransformStream<SSEEvent, LanguageModelV3StreamPart>({
			transform(event, controller) {
				if (!event.data || event.data === "[DONE]") {
					if (event.data === "[DONE]") {
						receivedDone = true;
					}
					return;
				}

				receivedAnyData = true;

				let chunk: unknown;
				try {
					chunk = JSON.parse(event.data);
				} catch {
					console.warn("[ai-search-provider] failed to parse SSE event:", event.data);
					return;
				}

				if (event.event === "chunks") {
					if (Array.isArray(chunk)) {
						for (const sourceChunk of chunk as AISearchChunk[]) {
							controller.enqueue(
								mapAISearchChunkToSource(sourceChunk) as LanguageModelV3StreamPart,
							);
						}
					}
					return;
				}

				const record = chunk as Record<string, unknown>;
				if (record.usage) {
					usage = mapAISearchUsage(record);
				}

				const choices = record.choices as
					| Array<{
							finish_reason?: string | null;
							delta?: { content?: string | null };
					  }>
					| undefined;

				const choice = choices?.[0];
				if (choice?.finish_reason != null) {
					finishReason = mapAISearchFinishReason(choice.finish_reason);
				}

				const textDelta = choice?.delta?.content;
				if (textDelta) {
					if (!textId) {
						textId = createId();
						controller.enqueue({ type: "text-start", id: textId });
					}
					controller.enqueue({ type: "text-delta", id: textId, delta: textDelta });
				}
			},

			flush(controller) {
				if (textId) {
					controller.enqueue({ type: "text-end", id: textId });
				}

				// AI Search always terminates a stream with `data: [DONE]` (per the
				// docs), so data received without that sentinel means the stream was
				// cut off mid-flight — surface it as an error rather than a clean stop.
				controller.enqueue({
					type: "finish",
					finishReason:
						!receivedDone && receivedAnyData
							? { unified: "error", raw: "stream-truncated" }
							: finishReason,
					usage,
				});
			},
		}),
	);
}
