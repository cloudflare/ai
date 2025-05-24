import { events } from "fetch-event-stream";

import type { LanguageModelV1StreamPart } from "@ai-sdk/provider";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { processPartialToolCalls } from "./utils";

export function getMappedStream(response: Response) {
	const chunkEvent = events(response);
	let usage = { promptTokens: 0, completionTokens: 0 };
	const partialToolCalls: any[] = [];

	return new ReadableStream<LanguageModelV1StreamPart>({
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
					continue;
				}
				chunk.response?.length &&
					controller.enqueue({
						type: "text-delta",
						textDelta: chunk.response,
					});
			}

			if (partialToolCalls.length > 0) {
				const toolCalls = processPartialToolCalls(partialToolCalls);
				toolCalls.map((toolCall) => {
					controller.enqueue({
						type: "tool-call",
						...toolCall,
					});
				});
			}

			controller.enqueue({
				type: "finish",
				finishReason: "stop",
				usage: usage,
			});
			controller.close();
		},
	});
}
