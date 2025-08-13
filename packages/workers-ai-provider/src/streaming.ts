import type { LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { events } from "fetch-event-stream";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { processPartialToolCalls } from "./utils";
import { generateId } from "ai";

export function getMappedStream(response: Response) {
	const chunkEvent = events(response);
	let usage = { outputTokens: 0, inputTokens: 0, totalTokens: 0 };
	const partialToolCalls: any[] = [];

	// Track start/delta/end IDs per v5 streaming protocol
	let textId: string | null = null;
	let reasoningId: string | null = null;

	return new ReadableStream<LanguageModelV2StreamPart>({
		async start(controller) {
			for await (const event of chunkEvent) {
				if (!event.data) {
					continue;
				}
				if (event.data === "[DONE]") {
					break;
				}
				const chunk = JSON.parse(event.data);
				if (chunk.usage) {
					usage = mapWorkersAIUsage(chunk);
				}
				if (chunk.tool_calls) {
					partialToolCalls.push(...chunk.tool_calls);
				}

				// Handle top-level response text
				if (chunk.response?.length) {
					if (!textId) {
						textId = generateId();
						controller.enqueue({ type: "text-start", id: textId });
					}
					controller.enqueue({ type: "text-delta", id: textId, delta: chunk.response });
				}

				// Handle reasoning content
				const reasoningDelta = chunk?.choices?.[0]?.delta?.reasoning_content;
				if (reasoningDelta?.length) {
					if (!reasoningId) {
						reasoningId = generateId();
						controller.enqueue({ type: "reasoning-start", id: reasoningId });
					}
					controller.enqueue({
						type: "reasoning-delta",
						id: reasoningId,
						delta: reasoningDelta,
					});
				}

				// Handle text content from choices
				const textDelta = chunk?.choices?.[0]?.delta?.content;
				if (textDelta?.length) {
					if (!textId) {
						textId = generateId();
						controller.enqueue({ type: "text-start", id: textId });
					}
					controller.enqueue({ type: "text-delta", id: textId, delta: textDelta });
				}
			}

			if (partialToolCalls.length > 0) {
				const toolCalls = processPartialToolCalls(partialToolCalls);
				toolCalls.map((toolCall) => {
					controller.enqueue(toolCall);
				});
			}

			// Close any open blocks
			if (reasoningId) {
				controller.enqueue({ type: "reasoning-end", id: reasoningId });
				reasoningId = null;
			}
			if (textId) {
				controller.enqueue({ type: "text-end", id: textId });
				textId = null;
			}

			controller.enqueue({
				finishReason: "stop",
				type: "finish",
				usage: usage,
			});
			controller.close();
		},
	});
}
