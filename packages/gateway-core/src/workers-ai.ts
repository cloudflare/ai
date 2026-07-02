/**
 * Shared, framework-agnostic Workers AI helpers.
 *
 * These are the pieces that `workers-ai-provider` (native `LanguageModelV4`) and
 * `@cloudflare/tanstack-ai` (OpenAI-SDK shim) both need: the SSE byte decoder,
 * message normalization for the binding's stricter schema, response-text
 * extraction across WAI's response shapes, and the gpt-oss forced-tool-call
 * salvage.
 *
 * IMPORTANT — id/dependency decoupling: nothing here depends on the `ai` package
 * or mints framework tool-call ids. `parseLeakedToolCalls` returns neutral
 * `{ toolName, input }` records; each consumer assigns its own ids and adapts to
 * its own tool-call shape. This keeps `gateway-core` free of an `ai` dependency.
 */

// ---------------------------------------------------------------------------
// SSE byte decoding
// ---------------------------------------------------------------------------

/**
 * TransformStream that decodes a raw byte stream into SSE `data:` payloads.
 * Each output chunk is the string content after `data: ` (one per SSE event),
 * with line buffering for partial chunks.
 */
export class SSEDecoder extends TransformStream<Uint8Array, string> {
	constructor() {
		let buffer = "";
		const decoder = new TextDecoder();

		const emit = (line: string, controller: TransformStreamDefaultController<string>) => {
			const trimmed = line.trim();
			if (!trimmed) return;
			if (trimmed.startsWith("data: ")) {
				controller.enqueue(trimmed.slice(6));
			} else if (trimmed.startsWith("data:")) {
				controller.enqueue(trimmed.slice(5));
			}
		};

		super({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) emit(line, controller);
			},

			flush(controller) {
				if (buffer.trim()) emit(buffer, controller);
			},
		});
	}
}

// ---------------------------------------------------------------------------
// Message normalization
// ---------------------------------------------------------------------------

/**
 * Normalize messages before passing to the Workers AI binding.
 *
 * The binding has strict schema validation that differs from the OpenAI API:
 * `content` must not be `null`/`undefined` (coerced to `""`). Content arrays
 * (image_url parts) pass through untouched for vision-capable models.
 */
export function normalizeMessagesForBinding<T extends Record<string, unknown>>(messages: T[]): T[] {
	return messages.map((msg) => {
		const normalized = { ...msg };
		if (normalized.content === null || normalized.content === undefined) {
			(normalized as Record<string, unknown>).content = "";
		}
		return normalized;
	});
}

// ---------------------------------------------------------------------------
// Response-text extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from a Workers AI response, handling multiple response shapes:
 * - OpenAI format: `{ choices: [{ message: { content: "..." } }] }`
 * - Native format: `{ response: "..." }`
 * - Structured-output quirk: `{ response: { ... } }` (object) / `"{ ... }"` (JSON string)
 * - Numeric `{ response: 42 }`
 */
export function processText(output: Record<string, unknown>): string | undefined {
	const choices = output.choices as Array<{ message?: { content?: string | null } }> | undefined;
	const choiceContent = choices?.[0]?.message?.content;
	if (choiceContent != null && String(choiceContent).length > 0) {
		return String(choiceContent);
	}

	if ("response" in output) {
		const response = output.response;
		if (typeof response === "object" && response !== null) {
			return JSON.stringify(response);
		}
		if (typeof response === "number") {
			return String(response);
		}
		if (response === null || response === undefined) {
			return undefined;
		}
		return String(response);
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Forced tool-call salvage (gpt-oss harmony quirk)
// ---------------------------------------------------------------------------

/** A tool call recovered from leaked text — id-less and framework-neutral. */
export interface NeutralToolCall {
	toolName: string;
	/** JSON-encoded arguments string. */
	input: string;
}

/**
 * Was a specific tool forced for this request?
 *
 * True for both `tool_choice: "required"` and the named-function form
 * `{ type: "function", function: { name } }`.
 */
export function isForcedToolChoice(toolChoice: unknown): boolean {
	if (toolChoice === "required") return true;
	return (
		typeof toolChoice === "object" &&
		toolChoice !== null &&
		(toolChoice as { type?: unknown }).type === "function"
	);
}

/** Collect the requested tool names from mapped tools. */
export function getToolNames(
	tools: Array<{ function: { name?: string } }> | undefined,
): Set<string> {
	return new Set(
		(tools ?? [])
			.map((tool) => tool.function?.name)
			.filter((name): name is string => typeof name === "string"),
	);
}

/**
 * Parse tool calls that a model leaked as JSON text instead of structured
 * `tool_calls`. Shared by the non-streaming salvage and the streaming buffer.
 *
 * Only JSON objects whose `name` is one of `knownToolNames` are recovered;
 * everything else (prose, harmony channel/role leaks like `{"name":"analysis"}`,
 * hallucinated names) is ignored to avoid fabricating bogus calls.
 *
 * Returns neutral `{ toolName, input }` records — callers assign their own ids.
 */
export function parseLeakedToolCalls(text: string, knownToolNames: Set<string>): NeutralToolCall[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text.trim());
	} catch {
		return [];
	}

	const candidates = Array.isArray(parsed) ? parsed : [parsed];
	const salvaged: NeutralToolCall[] = [];

	for (const candidate of candidates) {
		if (typeof candidate !== "object" || candidate === null) continue;
		const obj = candidate as Record<string, unknown>;
		const name = obj.name;
		if (typeof name !== "string" || !knownToolNames.has(name)) continue;

		// Arguments may be wrapped (`arguments`/`parameters`) or flattened as
		// siblings of `name`.
		let args: unknown;
		if ("arguments" in obj) {
			args = obj.arguments;
		} else if ("parameters" in obj) {
			args = obj.parameters;
		} else {
			const { name: _name, ...rest } = obj;
			args = rest;
		}

		salvaged.push({
			toolName: name,
			input: typeof args === "string" ? args : JSON.stringify(args ?? {}),
		});
	}

	return salvaged;
}
