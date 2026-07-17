import type { LanguageModelV3Prompt } from "@ai-sdk/provider";

/**
 * AI Search message content — either a plain string or a structured content
 * array (OpenAI-compatible multimodal format). The binding type constrains
 * `content` to `string | null`, but the runtime API accepts structured arrays
 * for images and files.
 */
type AISearchContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } }
	| { type: "file"; file: { url: string } };

type AISearchMessage = {
	role: "system" | "developer" | "user" | "assistant" | "tool";
	content: string | null | AISearchContentPart[];
};

function stringifyOutput(output: unknown): string {
	if (output == null) {
		return "";
	}

	if (typeof output !== "object") {
		return String(output);
	}

	const typed = output as { type?: string; value?: unknown; reason?: string };
	switch (typed.type) {
		case "text":
		case "error-text": {
			return typeof typed.value === "string" ? typed.value : String(typed.value ?? "");
		}
		case "json":
		case "error-json": {
			return JSON.stringify(typed.value);
		}
		case "execution-denied": {
			return typed.reason
				? `Tool execution denied: ${typed.reason}`
				: "Tool execution was denied.";
		}
		case "content": {
			const value = typed.value;
			return Array.isArray(value)
				? value
						.filter(
							(part): part is { type: "text"; text: string } =>
								part?.type === "text" && typeof part.text === "string",
						)
						.map((part) => part.text)
						.join("\n")
				: "";
		}
		default: {
			return JSON.stringify(output);
		}
	}
}

/**
 * Encode file data as a base64 data URI. Accepts the AI SDK's
 * `LanguageModelV3DataContent` union: string (already base64), Uint8Array,
 * or URL (whose string form is used directly — e.g. a data: or https: URL).
 */
function toDataUrl(data: string | Uint8Array | URL, mediaType: string): string {
	if (data instanceof URL) {
		return data.toString();
	}
	const base64 =
		typeof data === "string"
			? data
			: btoa(Array.from(data, (b) => String.fromCharCode(b)).join(""));
	return `data:${mediaType};base64,${base64}`;
}

export function convertToAISearchMessages(prompt: LanguageModelV3Prompt): AISearchMessage[] {
	const messages: AISearchMessage[] = [];

	for (const { role, content } of prompt) {
		switch (role) {
			case "system": {
				messages.push({ role: "system", content });
				break;
			}

			case "user": {
				let hasFileParts = false;
				for (const part of content) {
					if (part.type === "file") {
						hasFileParts = true;
						break;
					}
				}

				if (!hasFileParts) {
					// Text-only message — use simple string content.
					const textParts: string[] = [];
					for (const part of content) {
						if (part.type === "text") {
							textParts.push(part.text);
						}
					}
					messages.push({ role: "user", content: textParts.join("\n") });
				} else {
					// Multimodal message — use structured content array.
					const parts: AISearchContentPart[] = [];
					for (const part of content) {
						switch (part.type) {
							case "text": {
								parts.push({ type: "text", text: part.text });
								break;
							}
							case "file": {
								const url = toDataUrl(part.data, part.mediaType);
								if (part.mediaType.startsWith("image/")) {
									parts.push({ type: "image_url", image_url: { url } });
								} else {
									parts.push({ type: "file", file: { url } });
								}
								break;
							}
						}
					}
					messages.push({ role: "user", content: parts });
				}
				break;
			}

			case "assistant": {
				const textParts: string[] = [];
				for (const part of content) {
					switch (part.type) {
						case "text": {
							textParts.push(part.text);
							break;
						}
						case "reasoning": {
							textParts.push(part.text);
							break;
						}
						case "tool-call": {
							textParts.push(`Tool call ${part.toolName}: ${JSON.stringify(part.input)}`);
							break;
						}
						case "tool-result": {
							textParts.push(stringifyOutput(part.output));
							break;
						}
						case "file": {
							// Assistant file parts are from conversation history — include
							// a textual representation rather than erroring.
							textParts.push(`[file: ${part.mediaType}]`);
							break;
						}
					}
				}
				messages.push({ role: "assistant", content: textParts.join("\n") });
				break;
			}

			case "tool": {
				const textParts: string[] = [];
				for (const part of content) {
					if (part.type === "tool-result") {
						textParts.push(stringifyOutput(part.output));
					}
				}
				messages.push({ role: "tool", content: textParts.join("\n") });
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
