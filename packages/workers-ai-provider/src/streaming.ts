import { events } from "fetch-event-stream";

import type { LanguageModelV1StreamPart } from "@ai-sdk/provider";
import { mapWorkersAIUsage } from "./map-workersai-usage";

export function getMappedStream(response: Response) {
	const chunkEvent = events(response);
	let usage = { promptTokens: 0, completionTokens: 0 };

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
				chunk.response?.length &&
					controller.enqueue({
						type: "text-delta",
						textDelta: chunk.response,
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
