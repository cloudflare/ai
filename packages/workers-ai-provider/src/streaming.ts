import type {
	LanguageModelV3FinishReason,
	LanguageModelV3StreamPart,
	LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { generateId } from "ai";
import { events } from "fetch-event-stream";
import { mapWorkersAIFinishReason } from "./map-workersai-finish-reason";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { processPartialToolCalls } from "./utils";

export function getMappedStream(response: Response) {
	const chunkEvent = events(response);
	let usage: LanguageModelV3Usage = {
		outputTokens: { total: 0, text: undefined, reasoning: undefined },
		inputTokens: {
			total: 0,
			noCache: undefined,
			cacheRead: undefined,
			cacheWrite: undefined,
		},
		raw: {
			totalTokens: 0,
		},
	};
	const partialToolCalls: any[] = [];

	// Track start/delta/end IDs per v5 streaming protocol
	let textId: string | null = null;
	let reasoningId: string | null = null;
	let finishReason: LanguageModelV3FinishReason | null = null;

	return new ReadableStream<LanguageModelV3StreamPart>({
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

				// Extract finish_reason from chunk (only update if non-null to avoid overwriting)
				const choiceFinishReason = chunk?.choices?.[0]?.finish_reason;
				const directFinishReason = chunk?.finish_reason;

				if (choiceFinishReason != null) {
					finishReason = mapWorkersAIFinishReason(choiceFinishReason);
				} else if (directFinishReason != null) {
					finishReason = mapWorkersAIFinishReason(directFinishReason);
				}

				// Handle top-level response text
				if (chunk.response?.length) {
					if (!textId) {
						textId = generateId();
						controller.enqueue({ type: "text-start", id: textId });
					}
					controller.enqueue({
						type: "text-delta",
						id: textId,
						delta: chunk.response,
					});
				}

				// Handling number responses for models like Llama4
				if (typeof chunk.response === "number") {
					if (!textId) {
						textId = generateId();
						controller.enqueue({ type: "text-start", id: textId });
					}
					controller.enqueue({
						type: "text-delta",
						id: textId,
						delta: String(chunk.response),
					});
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
					controller.enqueue({
						type: "text-delta",
						id: textId,
						delta: textDelta,
					});
				}
			}

			if (partialToolCalls.length > 0) {
				const toolCalls = processPartialToolCalls(partialToolCalls);
				toolCalls.forEach((toolCall) => {
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
				finishReason: finishReason ?? { unified: "stop", raw: "stop" },
				type: "finish",
				usage: usage,
			});
			controller.close();
		},
	});
}
