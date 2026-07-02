import type { LanguageModelV4Prompt, SharedV4FileData } from "@ai-sdk/provider";
import { UnsupportedFunctionalityError } from "@ai-sdk/provider";
import { toWorkersAIToolCallId } from "./utils";
import type { WorkersAIContentPart, WorkersAIChatPrompt } from "./workersai-chat-prompt";

/**
 * Normalise a tagged `SharedV4FileData` value to a Uint8Array.
 *
 * Handles:
 *   - { type: 'data' }      → Uint8Array returned as-is; string decoded from
 *                             base64 (with or without data-URL prefix)
 *   - { type: 'url' }       → not supported (Workers AI needs raw bytes, not a reference)
 *   - { type: 'reference' } → not supported (Workers AI has no file store to resolve it)
 *   - { type: 'text' }      → not supported for image parts
 */
function toUint8Array(fileData: SharedV4FileData): Uint8Array | null {
	switch (fileData.type) {
		case "data": {
			const data = fileData.data;
			if (data instanceof Uint8Array) {
				return data;
			}
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

		case "url": {
			throw new Error(
				"URL image sources are not supported by Workers AI. " +
					"Provide image data as a Uint8Array or base64 string instead.",
			);
		}

		case "reference": {
			throw new UnsupportedFunctionalityError({
				functionality: "file-part-provider-reference",
				message:
					"Provider file references are not supported by Workers AI. " +
					"Provide image data as a Uint8Array or base64 string instead.",
			});
		}

		case "text": {
			throw new UnsupportedFunctionalityError({
				functionality: "file-part-inline-text",
				message:
					"Inline text file parts are not supported by Workers AI chat. " +
					"Pass text as a regular text part instead.",
			});
		}

		default: {
			const exhaustiveCheck = fileData satisfies never;
			throw new Error(
				`Unsupported file data type: ${(exhaustiveCheck as { type: string }).type}`,
			);
		}
	}
}

function assertImageMediaType(mediaType: string | undefined): string {
	if (!mediaType) {
		throw new UnsupportedFunctionalityError({
			functionality: "file-part-without-media-type",
			message:
				"Workers AI chat only supports image file parts with an image/* mediaType. " +
				"Received a file part without a mediaType.",
		});
	}

	// Media types are case-insensitive (RFC 2045), so compare against a
	// lower-cased copy while preserving the caller's original casing on output.
	if (!mediaType.toLowerCase().startsWith("image/")) {
		throw new UnsupportedFunctionalityError({
			functionality: "non-image-file-part",
			message:
				"Workers AI chat only supports image file parts with an image/* mediaType. " +
				`Received mediaType "${mediaType}".`,
		});
	}

	return mediaType;
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

export function convertToWorkersAIChatMessages(prompt: LanguageModelV4Prompt): {
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
				const imageParts: { image: Uint8Array; mediaType: string }[] = [];

				for (const part of content) {
					switch (part.type) {
						case "text": {
							textParts.push(part.text);
							break;
						}
						case "file": {
							const mediaType = assertImageMediaType(part.mediaType);
							const imageBytes = toUint8Array(part.data);
							if (imageBytes) {
								imageParts.push({
									image: imageBytes,
									mediaType,
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
						contentArray.push({
							type: "image_url",
							image_url: { url: `data:${img.mediaType};base64,${base64}` },
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
				let reasoning = "";
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
							// Reasoning is accumulated separately and sent as the `reasoning`
							// field on the message object. This is the field name vLLM expects
							// on input for reasoning models (kimi-k2.7-code, glm-4.7-flash).
							// Concatenating it into `content` corrupts the conversation history
							// and causes models to produce empty or garbled responses on the
							// next turn.
							reasoning += part.text;
							break;
						}

						case "file": {
							// File parts in assistant messages - no action needed
							break;
						}

						case "reasoning-file": {
							// Files inside reasoning traces (new in spec v4) cannot be
							// replayed to Workers AI - no action needed
							break;
						}

						case "custom": {
							// Provider-specific custom parts (new in spec v4) from other
							// providers are not replayable to Workers AI - no action needed
							break;
						}

						case "tool-call": {
							toolCalls.push({
								function: {
									arguments: JSON.stringify(part.input),
									name: part.toolName,
								},
								id: toWorkersAIToolCallId(part.toolCallId),
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
					...(reasoning ? { reasoning } : {}),
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
						const output = toolResponse.output;
						let content: string;
						switch (output.type) {
							case "text":
							case "error-text":
								content = output.value;
								break;
							case "json":
							case "error-json":
								content = JSON.stringify(output.value);
								break;
							case "execution-denied":
								content = output.reason
									? `Tool execution denied: ${output.reason}`
									: "Tool execution was denied.";
								break;
							case "content":
								content = output.value
									.filter(
										(p): p is { type: "text"; text: string } =>
											p.type === "text",
									)
									.map((p) => p.text)
									.join("\n");
								break;
							default:
								content = "";
								break;
						}
						messages.push({
							content,
							name: toolResponse.toolName,
							tool_call_id: toWorkersAIToolCallId(toolResponse.toolCallId),
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
