import type { LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { events } from "fetch-event-stream";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { processPartialToolCalls } from "./utils";
import { generateId } from "ai";

export function getMappedStream(response: Response) {
	const chunkEvent = events(response);
	let usage = { outputTokens: 0, inputTokens: 0, totalTokens: 0 };
	const partialToolCalls: any[] = [];

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
				chunk.response?.length &&
					controller.enqueue({
						delta: chunk.response,
						type: "text-delta",
						id: generateId(),
					});
				chunk?.choices?.[0]?.delta?.reasoning_content?.length &&
					controller.enqueue({
						type: "reasoning-delta",
						delta: chunk.choices[0].delta.reasoning_content,
						id: generateId(),
					});
				chunk?.choices?.[0]?.delta?.content?.length &&
					controller.enqueue({
						type: "text-delta",
						delta: chunk.choices[0].delta.content,
						id: generateId(),
					});
			}

			if (partialToolCalls.length > 0) {
				const toolCalls = processPartialToolCalls(partialToolCalls);
				toolCalls.map((toolCall) => {
					controller.enqueue(toolCall);
				});
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
