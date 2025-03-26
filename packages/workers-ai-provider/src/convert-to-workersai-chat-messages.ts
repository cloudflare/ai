import { type LanguageModelV1Prompt, UnsupportedFunctionalityError } from "@ai-sdk/provider";
import type { WorkersAIChatPrompt } from "./workersai-chat-prompt";

export function convertToWorkersAIChatMessages(prompt: LanguageModelV1Prompt): WorkersAIChatPrompt {
	const messages: WorkersAIChatPrompt = [];

	for (const { role, content } of prompt) {
		switch (role) {
			case "system": {
				messages.push({ role: "system", content });
				break;
			}

			case "user": {
				messages.push({
					role: "user",
					content: content
						.map((part) => {
							switch (part.type) {
								case "text": {
									return part.text;
								}
								case "image": {
									throw new UnsupportedFunctionalityError({
										functionality: "image-part",
									});
								}
							}
						})
						.join(""),
				});
				break;
			}

			case "assistant": {
				let text = "";
				const toolCalls: Array<{
					id: string;
					type: "function";
					function: { name: string; arguments: string };
				}> = [];

				for (const part of content) {
					switch (part.type) {
						case "text": {
							text += part.text;
							break;
						}
						case "tool-call": {
							text = JSON.stringify({
								name: part.toolName,
								parameters: part.args,
							});

							toolCalls.push({
								id: part.toolCallId,
								type: "function",
								function: {
									name: part.toolName,
									arguments: JSON.stringify(part.args),
								},
							});
							break;
						}
						default: {
							const exhaustiveCheck = part;
							throw new Error(`Unsupported part: ${exhaustiveCheck}`);
						}
					}
				}

				messages.push({
					role: "assistant",
					content: text,
					tool_calls:
						toolCalls.length > 0
							? toolCalls.map(({ function: { name, arguments: args } }) => ({
									id: "null",
									type: "function",
									function: { name, arguments: args },
								}))
							: undefined,
				});

				break;
			}
			case "tool": {
				for (const toolResponse of content) {
					messages.push({
						role: "tool",
						name: toolResponse.toolName,
						content: JSON.stringify(toolResponse.result),
					});
				}
				break;
			}
			default: {
				const exhaustiveCheck = role satisfies never;
				throw new Error(`Unsupported role: ${exhaustiveCheck}`);
			}
		}
	}

	return messages;
}
