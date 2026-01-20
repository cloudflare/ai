import type { LanguageModelV3Prompt, SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { WorkersAIChatPrompt } from "./workersai-chat-prompt";

export function convertToWorkersAIChatMessages(prompt: LanguageModelV3Prompt): {
	messages: WorkersAIChatPrompt;
	images: {
		mimeType: string | undefined;
		image: Uint8Array;
		providerOptions: SharedV3ProviderOptions | undefined;
	}[];
} {
	const messages: WorkersAIChatPrompt = [];
	const images: {
		mimeType: string | undefined;
		image: Uint8Array;
		providerOptions: SharedV3ProviderOptions | undefined;
	}[] = [];

	for (const { role, content } of prompt) {
		switch (role) {
			case "system": {
				messages.push({ content, role: "system" });
				break;
			}

			case "user": {
				messages.push({
					content: content
						.map((part) => {
							switch (part.type) {
								case "text": {
									return part.text;
								}
								case "file": {
									// Extract image from this part
									if (part.data instanceof Uint8Array) {
										// Store the image data directly as Uint8Array
										// For Llama 3.2 Vision model, which needs array of integers
										images.push({
											image: part.data,
											mimeType: part.mediaType,
											providerOptions: part.providerOptions,
										});
									}
									return ""; // No text for the image part
								}
							}

							return undefined;
						})
						.join("\n"),
					role: "user",
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

						case "reasoning": {
							text += part.text;
							break;
						}

						case "tool-call": {
							text = JSON.stringify({
								name: part.toolName,
								parameters: part.input,
							});

							toolCalls.push({
								function: {
									arguments: JSON.stringify(part.input),
									name: part.toolName,
								},
								id: part.toolCallId,
								type: "function",
							});
							break;
						}
						case "file":
						case "tool-result": {
							// Skip file and tool-result parts in assistant messages
							break;
						}
					}
				}

				messages.push({
					content: text,
					role: "assistant",
					tool_calls:
						toolCalls.length > 0
							? toolCalls.map(({ function: { name, arguments: args } }, index) => ({
									function: { arguments: args, name },
									id: `functions.${name}:${index}`,
									type: "function",
								}))
							: undefined,
				});

				break;
			}

			case "tool": {
				let toolResultIndex = 0;
				for (const toolResponse of content) {
					// Only process tool-result parts, skip tool-approval-response
					if (toolResponse.type === "tool-result") {
						messages.push({
							content: JSON.stringify(toolResponse.output),
							name: toolResponse.toolName,
							tool_call_id: `functions.${toolResponse.toolName}:${toolResultIndex}`,
							role: "tool",
						});
						toolResultIndex++;
					}
				}
				break;
			}

			default: {
				const exhaustiveCheck = role satisfies never;
				throw new Error(`Unsupported role: ${exhaustiveCheck}`);
			}
		}
	}

	return { images, messages };
}
