import type {
	LanguageModelV3FinishReason,
	LanguageModelV3StreamPart,
	LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { generateId } from "ai";
import { mapWorkersAIFinishReason } from "./map-workersai-finish-reason";
import { mapWorkersAIUsage } from "./map-workersai-usage";

/**
 * Prepend a stream-start event to an existing LanguageModelV3 stream.
 * Uses pipeThrough for proper backpressure and error propagation.
 */
export function prependStreamStart(
	source: ReadableStream<LanguageModelV3StreamPart>,
	warnings: LanguageModelV3StreamPart extends { type: "stream-start" } ? never : unknown,
): ReadableStream<LanguageModelV3StreamPart> {
	let sentStart = false;
	return source.pipeThrough(
		new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
			transform(chunk, controller) {
				if (!sentStart) {
					sentStart = true;
					controller.enqueue({
						type: "stream-start",
						warnings: warnings as [],
					});
				}
				controller.enqueue(chunk);
			},
			flush(controller) {
				if (!sentStart) {
					controller.enqueue({
						type: "stream-start",
						warnings: warnings as [],
					});
				}
			},
		}),
	);
}

/**
 * Check if a streaming tool call chunk is a null-finalization sentinel.
 */
function isNullFinalizationChunk(tc: Record<string, unknown>): boolean {
	const fn = tc.function as Record<string, unknown> | undefined;
	const name = fn?.name ?? tc.name ?? null;
	const args = fn?.arguments ?? tc.arguments ?? null;
	const id = tc.id ?? null;
	return !id && !name && (!args || args === "");
}

/**
 * Maps a Workers AI SSE stream into AI SDK V3 LanguageModelV3StreamPart events.
 *
 * Uses a TransformStream pipeline for proper backpressure — chunks are emitted
 * one at a time as the downstream consumer pulls, not buffered eagerly.
 *
 * Handles two distinct formats:
 * 1. Native format:  { response: "chunk", tool_calls: [...] }
 * 2. OpenAI format:  { choices: [{ delta: { content: "chunk" } }] }
 */
export function getMappedStream(
	response: Response | ReadableStream<Uint8Array>,
): ReadableStream<LanguageModelV3StreamPart> {
	const rawStream =
		response instanceof ReadableStream
			? response
			: (response.body as ReadableStream<Uint8Array>);

	if (!rawStream) {
		throw new Error("No readable stream available for SSE parsing.");
	}

	// State shared across the transform
	let usage: LanguageModelV3Usage = {
		outputTokens: { total: 0, text: undefined, reasoning: undefined },
		inputTokens: {
			total: 0,
			noCache: undefined,
			cacheRead: undefined,
			cacheWrite: undefined,
		},
		raw: { totalTokens: 0 },
	};
	let textId: string | null = null;
	let reasoningId: string | null = null;
	let finishReason: LanguageModelV3FinishReason | null = null;
	let receivedDone = false;
	let receivedAnyData = false;

	// Track tool call streaming state per index.
	// When we see the first chunk for a tool call index, we emit tool-input-start.
	// Subsequent argument deltas emit tool-input-delta.
	// tool-input-end is emitted eagerly when a new tool index starts or a null
	// finalization chunk arrives; any remaining open calls are closed in flush().
	const activeToolCalls = new Map<number, { id: string; toolName: string; args: string }>();
	const closedToolCalls = new Set<number>();
	let lastActiveToolIndex: number | null = null;

	// Step 1: Decode bytes into SSE lines
	const sseStream = rawStream.pipeThrough(new SSEDecoder());

	// Step 2: Transform SSE events into LanguageModelV3StreamPart
	return sseStream.pipeThrough(
		new TransformStream<string, LanguageModelV3StreamPart>({
			transform(data, controller) {
				if (!data || data === "[DONE]") {
					if (data === "[DONE]") receivedDone = true;
					return;
				}

				receivedAnyData = true;
				let chunk: Record<string, unknown>;
				try {
					chunk = JSON.parse(data);
				} catch {
					console.warn("[workers-ai-provider] failed to parse SSE event:", data);
					return;
				}

				if (chunk.usage) {
					usage = mapWorkersAIUsage(chunk as Parameters<typeof mapWorkersAIUsage>[0]);
				}

				// Extract finish_reason
				const choices = chunk.choices as
					| Array<{
							finish_reason?: string;
							delta?: Record<string, unknown>;
					  }>
					| undefined;
				const choiceFinishReason = choices?.[0]?.finish_reason;
				const directFinishReason = chunk.finish_reason as string | undefined;

				if (choiceFinishReason != null) {
					finishReason = mapWorkersAIFinishReason(choiceFinishReason);
				} else if (directFinishReason != null) {
					finishReason = mapWorkersAIFinishReason(directFinishReason);
				}

				// --- Native format: top-level `response` field ---
				const nativeResponse = chunk.response;
				if (nativeResponse != null && nativeResponse !== "") {
					const responseText = String(nativeResponse);
					if (responseText.length > 0) {
						// Close active reasoning block before text starts
						if (reasoningId) {
							controller.enqueue({ type: "reasoning-end", id: reasoningId });
							reasoningId = null;
						}
						if (!textId) {
							textId = generateId();
							controller.enqueue({ type: "text-start", id: textId });
						}
						controller.enqueue({
							type: "text-delta",
							id: textId,
							delta: responseText,
						});
					}
				}

				// --- Native format: top-level `tool_calls` ---
				if (Array.isArray(chunk.tool_calls)) {
					// Close active reasoning block before tool calls start
					if (reasoningId) {
						controller.enqueue({ type: "reasoning-end", id: reasoningId });
						reasoningId = null;
					}
					emitToolCallDeltas(chunk.tool_calls as Record<string, unknown>[], controller);
				}

				// --- OpenAI format: choices[0].delta ---
				if (choices?.[0]?.delta) {
					const delta = choices[0].delta;

					const reasoningDelta = (delta.reasoning_content ?? delta.reasoning) as
						| string
						| undefined;
					if (reasoningDelta && reasoningDelta.length > 0) {
						if (!reasoningId) {
							reasoningId = generateId();
							controller.enqueue({
								type: "reasoning-start",
								id: reasoningId,
							});
						}
						controller.enqueue({
							type: "reasoning-delta",
							id: reasoningId,
							delta: reasoningDelta,
						});
					}

					const textDelta = delta.content as string | undefined;
					if (textDelta && textDelta.length > 0) {
						// Close active reasoning block before text starts
						if (reasoningId) {
							controller.enqueue({ type: "reasoning-end", id: reasoningId });
							reasoningId = null;
						}
						if (!textId) {
							textId = generateId();
							controller.enqueue({ type: "text-start", id: textId });
						}
						controller.enqueue({
							type: "text-delta",
							id: textId,
							delta: textDelta,
						});
					}

					const deltaToolCalls = delta.tool_calls as
						| Record<string, unknown>[]
						| undefined;
					if (Array.isArray(deltaToolCalls)) {
						// Close active reasoning block before tool calls start
						if (reasoningId) {
							controller.enqueue({ type: "reasoning-end", id: reasoningId });
							reasoningId = null;
						}
						emitToolCallDeltas(deltaToolCalls, controller);
					}
				}
			},

			flush(controller) {
				// Close any tool calls that weren't already closed during streaming
				for (const [idx] of activeToolCalls) {
					if (closedToolCalls.has(idx)) continue;
					closeToolCall(idx, controller);
				}

				// Close open text/reasoning blocks
				if (reasoningId) {
					controller.enqueue({ type: "reasoning-end", id: reasoningId });
				}
				if (textId) {
					controller.enqueue({ type: "text-end", id: textId });
				}

				// Detect premature termination
				const effectiveFinishReason =
					!receivedDone && receivedAnyData && !finishReason
						? ({
								unified: "error",
								raw: "stream-truncated",
							} as LanguageModelV3FinishReason)
						: (finishReason ?? { unified: "stop", raw: "stop" });

				controller.enqueue({
					finishReason: effectiveFinishReason,
					type: "finish",
					usage,
				});
			},
		}),
	);

	/**
	 * Emit tool-input-end + tool-call for a tool call that is complete.
	 */
	function closeToolCall(
		index: number,
		controller: TransformStreamDefaultController<LanguageModelV3StreamPart>,
	) {
		const tc = activeToolCalls.get(index);
		if (!tc || closedToolCalls.has(index)) return;
		closedToolCalls.add(index);
		controller.enqueue({ type: "tool-input-end", id: tc.id });
		controller.enqueue({
			type: "tool-call",
			toolCallId: tc.id,
			toolName: tc.toolName,
			input: tc.args,
		});
	}

	/**
	 * Emit incremental tool call events from streaming chunks.
	 *
	 * Workers AI streams tool calls as:
	 *   Chunk A: { id, type, index, function: { name } }                — start
	 *   Chunk B: { index, function: { arguments: "partial..." } }       — args delta
	 *   Chunk C: { index, function: { arguments: "rest..." } }          — args delta
	 *   Chunk D: { id: null, type: null, function: { name: null } }     — finalize
	 *
	 * We emit tool-input-start on first sight, tool-input-delta for each
	 * argument chunk, and tool-input-end eagerly — either when a new tool
	 * index starts (closing the previous one) or on a null finalization
	 * chunk. Any remaining open calls are closed in flush().
	 */
	function emitToolCallDeltas(
		toolCalls: Record<string, unknown>[],
		controller: TransformStreamDefaultController<LanguageModelV3StreamPart>,
	) {
		for (const tc of toolCalls) {
			if (isNullFinalizationChunk(tc)) {
				// Null finalization sentinel — close the last active tool call
				if (lastActiveToolIndex != null) {
					closeToolCall(lastActiveToolIndex, controller);
				}
				continue;
			}

			const tcIndex = (tc.index as number) ?? 0;
			const fn = tc.function as Record<string, unknown> | undefined;
			const tcName = (fn?.name ?? tc.name ?? null) as string | null;
			const tcArgs = (fn?.arguments ?? tc.arguments ?? null) as string | null;
			const tcId = tc.id as string | null;

			if (!activeToolCalls.has(tcIndex)) {
				// A new tool call is starting — close the previous one first
				if (lastActiveToolIndex != null && lastActiveToolIndex !== tcIndex) {
					closeToolCall(lastActiveToolIndex, controller);
				}

				const id = tcId || generateId();
				const toolName = tcName || "";
				activeToolCalls.set(tcIndex, { id, toolName, args: "" });
				lastActiveToolIndex = tcIndex;

				controller.enqueue({
					type: "tool-input-start",
					id,
					toolName,
				});

				if (tcArgs != null && tcArgs !== "") {
					const delta = typeof tcArgs === "string" ? tcArgs : JSON.stringify(tcArgs);
					activeToolCalls.get(tcIndex)!.args += delta;
					controller.enqueue({
						type: "tool-input-delta",
						id,
						delta,
					});
				}
			} else {
				const active = activeToolCalls.get(tcIndex)!;
				lastActiveToolIndex = tcIndex;
				if (tcArgs != null && tcArgs !== "") {
					const delta = typeof tcArgs === "string" ? tcArgs : JSON.stringify(tcArgs);
					active.args += delta;
					controller.enqueue({
						type: "tool-input-delta",
						id: active.id,
						delta,
					});
				}
			}
		}
	}
}

/**
 * TransformStream that decodes a raw byte stream into SSE `data:` payloads.
 * Each output chunk is the string content after "data: " (one per SSE event).
 * Handles line buffering for partial chunks.
 */
class SSEDecoder extends TransformStream<Uint8Array, string> {
	constructor() {
		let buffer = "";
		const decoder = new TextDecoder();

		super({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					if (trimmed.startsWith("data: ")) {
						controller.enqueue(trimmed.slice(6));
					} else if (trimmed.startsWith("data:")) {
						controller.enqueue(trimmed.slice(5));
					}
				}
			},

			flush(controller) {
				if (buffer.trim()) {
					const trimmed = buffer.trim();
					if (trimmed.startsWith("data: ")) {
						controller.enqueue(trimmed.slice(6));
					} else if (trimmed.startsWith("data:")) {
						controller.enqueue(trimmed.slice(5));
					}
				}
			},
		});
	}
}
