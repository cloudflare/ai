import type { LanguageModelV3DataContent, LanguageModelV3Prompt } from "@ai-sdk/provider";
import type { WorkersAIContentPart, WorkersAIChatPrompt } from "./workersai-chat-prompt";

/**
 * Normalise any LanguageModelV3DataContent value to a Uint8Array.
 *
 * Handles:
 *   - Uint8Array  → returned as-is
 *   - string      → decoded from base64 (with or without data-URL prefix)
 *   - URL         → not supported (Workers AI needs raw bytes, not a reference)
 */
function toUint8Array(data: LanguageModelV3DataContent): Uint8Array | null {
	if (data instanceof Uint8Array) {
		return data;
	}

	if (typeof data === "string") {
		let base64 = data;
		if (base64.startsWith("data:")) {
			const commaIndex = base64.indexOf(",");
			if (commaIndex >= 0) {
				base64 = base64.slice(commaIndex + 1);
			}
		}
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return bytes;
	}

	if (data instanceof URL) {
		throw new Error(
			"URL image sources are not supported by Workers AI. " +
				"Provide image data as a Uint8Array or base64 string instead.",
		);
	}

	return null;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 8192;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

export function convertToWorkersAIChatMessages(prompt: LanguageModelV3Prompt): {
	messages: WorkersAIChatPrompt;
} {
	const messages: WorkersAIChatPrompt = [];

	for (const { role, content } of prompt) {
		switch (role) {
			case "system": {
				messages.push({ content, role: "system" });
				break;
			}

			case "user": {
				const textParts: string[] = [];
				const imageParts: { image: Uint8Array; mediaType: string | undefined }[] = [];

				for (const part of content) {
					switch (part.type) {
						case "text": {
							textParts.push(part.text);
							break;
						}
						case "file": {
							const imageBytes = toUint8Array(part.data);
							if (imageBytes) {
								imageParts.push({
									image: imageBytes,
									mediaType: part.mediaType,
								});
							}
							break;
						}
					}
				}

				if (imageParts.length > 0) {
					const contentArray: WorkersAIContentPart[] = [];
					if (textParts.length > 0) {
						contentArray.push({ type: "text", text: textParts.join("\n") });
					}
					for (const img of imageParts) {
						const base64 = uint8ArrayToBase64(img.image);
						const mediaType = img.mediaType || "image/png";
						contentArray.push({
							type: "image_url",
							image_url: { url: `data:${mediaType};base64,${base64}` },
						});
					}
					messages.push({ content: contentArray, role: "user" });
				} else {
					messages.push({ content: textParts.join("\n"), role: "user" });
				}

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
							// Reasoning is passed through to text for the message conversion,
							// since Workers AI doesn't have a separate reasoning field in messages
							text += part.text;
							break;
						}

						case "file": {
							// File parts in assistant messages - no action needed
							break;
						}

						case "tool-call": {
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

						case "tool-result": {
							// Tool results in assistant messages - no action needed
							break;
						}

						default: {
							const exhaustiveCheck = part satisfies never;
							throw new Error(
								`Unsupported part type: ${(exhaustiveCheck as { type: string }).type}`,
							);
						}
					}
				}

				messages.push({
					content: text,
					role: "assistant",
					tool_calls:
						toolCalls.length > 0
							? toolCalls.map(({ function: { name, arguments: args }, id }) => ({
									function: { arguments: args, name },
									id,
									type: "function" as const,
								}))
							: undefined,
				});

				break;
			}

			case "tool": {
				for (const toolResponse of content) {
					if (toolResponse.type === "tool-result") {
						messages.push({
							content: JSON.stringify(toolResponse.output),
							name: toolResponse.toolName,
							tool_call_id: toolResponse.toolCallId,
							role: "tool",
						});
					}
					// Skip tool-approval-response parts as they're not supported by Workers AI
				}
				break;
			}

			default: {
				const exhaustiveCheck = role satisfies never;
				throw new Error(`Unsupported role: ${exhaustiveCheck}`);
			}
		}
	}

	return { messages };
}
