import type { LanguageModelV4, LanguageModelV4ToolCall } from "@ai-sdk/provider";
import {
	getToolNames,
	isForcedToolChoice,
	normalizeMessagesForBinding as coreNormalizeMessagesForBinding,
	parseLeakedToolCalls as coreParseLeakedToolCalls,
	processText,
} from "@cloudflare/gateway-core";
import { generateId } from "ai";
import type { WorkersAIChatPrompt } from "./workersai-chat-prompt";
import { apiCallErrorFromResponse } from "./workersai-error";

// Re-exported from `@cloudflare/gateway-core` (single source of truth) so the
// existing `workers-ai-provider/src/utils` import paths keep working unchanged.
export { getToolNames, isForcedToolChoice, processText } from "@cloudflare/gateway-core";

// ---------------------------------------------------------------------------
// Workers AI quirk workarounds
// ---------------------------------------------------------------------------

/**
 * Normalize messages before passing to the Workers AI binding.
 *
 * The binding has strict schema validation that differs from the OpenAI API:
 * - `content` must not be null
 */
export function normalizeMessagesForBinding(messages: WorkersAIChatPrompt): WorkersAIChatPrompt {
	return coreNormalizeMessagesForBinding(
		messages as unknown as Record<string, unknown>[],
	) as unknown as WorkersAIChatPrompt;
}

// ---------------------------------------------------------------------------
// REST API client
// ---------------------------------------------------------------------------

/**
 * General AI run interface with overloads to handle distinct return types.
 */
export interface AiRun {
	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options: AiOptions & { returnRawResponse: true },
	): Promise<Response>;

	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"] & { stream: true },
		options?: AiOptions,
	): Promise<ReadableStream<Uint8Array>>;

	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options?: AiOptions,
	): Promise<AiModels[Name]["postProcessedOutputs"]>;
}

/**
 * Parameters for configuring the Cloudflare-based AI runner.
 */
export interface CreateRunConfig {
	/** Your Cloudflare account identifier. */
	accountId: string;
	/** Cloudflare API token/key with appropriate permissions. */
	apiKey: string;
	/** Custom fetch implementation for intercepting requests. */
	fetch?: typeof globalThis.fetch;
}

/**
 * Creates a run method that emulates the Cloudflare Workers AI binding,
 * but uses the Cloudflare REST API under the hood.
 */
export function createRun(config: CreateRunConfig): AiRun {
	const { accountId, apiKey } = config;
	const fetchFn = config.fetch ?? globalThis.fetch;

	return async function run<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options?: AiOptions & Record<string, unknown>,
	): Promise<Response | ReadableStream<Uint8Array> | AiModels[Name]["postProcessedOutputs"]> {
		const {
			gateway,
			prefix: _prefix,
			extraHeaders,
			returnRawResponse,
			signal, // AbortSignal — not serializable as a query parameter
			...passthroughOptions
		} = options || {};

		const urlParams = new URLSearchParams();
		for (const [key, value] of Object.entries(passthroughOptions)) {
			if (value === undefined || value === null) {
				throw new Error(
					`Value for option '${key}' is not able to be coerced into a string.`,
				);
			}
			try {
				const valueStr = String(value);
				if (!valueStr) {
					continue;
				}
				urlParams.append(key, valueStr);
			} catch {
				throw new Error(
					`Value for option '${key}' is not able to be coerced into a string.`,
				);
			}
		}

		const queryString = urlParams.toString();

		const modelPath = String(model).startsWith("run/") ? model : `run/${model}`;

		// Build URL: use AI Gateway if gateway option is provided, otherwise direct API
		const url = gateway?.id
			? `https://gateway.ai.cloudflare.com/v1/${accountId}/${gateway.id}/workers-ai/${modelPath}${
					queryString ? `?${queryString}` : ""
				}`
			: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/${modelPath}${
					queryString ? `?${queryString}` : ""
				}`;

		const headers: Record<string, string> = {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(extraHeaders && typeof extraHeaders === "object"
				? (extraHeaders as Record<string, string>)
				: {}),
		};

		if (gateway) {
			if (gateway.skipCache) {
				headers["cf-aig-skip-cache"] = "true";
			}
			if (typeof gateway.cacheTtl === "number") {
				headers["cf-aig-cache-ttl"] = String(gateway.cacheTtl);
			}
			if (gateway.cacheKey) {
				headers["cf-aig-cache-key"] = gateway.cacheKey;
			}
			if (gateway.metadata) {
				headers["cf-aig-metadata"] = JSON.stringify(gateway.metadata);
			}
		}

		const body = JSON.stringify(inputs);

		const response = await fetchFn(url, {
			body,
			headers,
			method: "POST",
			signal: signal as AbortSignal | undefined,
		});

		// Check for HTTP errors before processing. Surface as an APICallError so
		// the AI SDK can classify retryability from the status (429 / 5xx → retry)
		// and honor any Retry-After header.
		if (!response.ok && !returnRawResponse) {
			let errorBody: string;
			try {
				errorBody = await response.text();
			} catch {
				errorBody = "<unable to read response body>";
			}
			throw apiCallErrorFromResponse(response, errorBody, {
				url,
				requestBodyValues: inputs,
			});
		}

		if (returnRawResponse) {
			return response;
		}

		if ((inputs as AiTextGenerationInput).stream === true) {
			const contentType = response.headers.get("content-type") || "";
			if (contentType.includes("event-stream") && response.body) {
				return response.body;
			}
			if (response.body && !contentType.includes("json")) {
				// Unknown content type — assume it's a stream
				return response.body;
			}

			// Some models (e.g. GPT-OSS) don't support streaming via the /ai/run/
			// endpoint and return a JSON response with empty result instead of SSE.
			// Retry without streaming so doStream's graceful degradation path can
			// wrap the complete response as a synthetic stream.
			// Use the same URL (gateway or direct) as the original request.
			const retryResponse = await fetchFn(url, {
				body: JSON.stringify({
					...(inputs as Record<string, unknown>),
					stream: false,
				}),
				headers,
				method: "POST",
				signal: signal as AbortSignal | undefined,
			});

			if (!retryResponse.ok) {
				let errorBody: string;
				try {
					errorBody = await retryResponse.text();
				} catch {
					errorBody = "<unable to read response body>";
				}
				throw apiCallErrorFromResponse(retryResponse, errorBody, {
					url,
					requestBodyValues: inputs,
				});
			}

			const retryData = await retryResponse.json<{
				result: AiModels[Name]["postProcessedOutputs"];
			}>();
			return retryData.result;
		}

		const data = await response.json<{
			result: AiModels[Name]["postProcessedOutputs"];
		}>();
		return data.result;
	};
}

/**
 * Make a binary REST API call to Workers AI.
 *
 * Some models (e.g. `@cf/deepgram/nova-3`) require raw audio bytes
 * with an appropriate `Content-Type` header instead of JSON.
 *
 * @param config  Credentials config
 * @param model   Workers AI model name
 * @param audioBytes  Raw audio bytes
 * @param contentType  MIME type (e.g. "audio/wav")
 * @param signal  Optional AbortSignal
 * @returns The parsed JSON response body
 */
export async function createRunBinary(
	config: CreateRunConfig,
	model: string,
	audioBytes: Uint8Array,
	contentType: string,
	signal?: AbortSignal,
): Promise<Record<string, unknown>> {
	const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${model}`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.apiKey}`,
			"Content-Type": contentType,
		},
		body: audioBytes,
		signal,
	});

	if (!response.ok) {
		let errorBody: string;
		try {
			errorBody = await response.text();
		} catch {
			errorBody = "<unable to read response body>";
		}
		throw apiCallErrorFromResponse(response, errorBody, {
			url,
			requestBodyValues: { contentType, byteLength: audioBytes.byteLength },
		});
	}

	const data = await response.json<{ result?: Record<string, unknown> }>();
	return (data.result ?? data) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Structured output (JSON mode)
// ---------------------------------------------------------------------------

/**
 * Build the `response_format.json_schema` payload for native Workers AI models.
 *
 * Native Workers AI (`@cf/...`) expects `json_schema` to be a **bare** JSON
 * Schema, NOT OpenAI's `{ name, schema, strict }` envelope. That envelope is
 * only required by partner-model routes (e.g. `openai/...`), which never reach
 * this code — they go through the gateway delegate and the real `@ai-sdk/*`
 * providers, which build the envelope themselves. Wrapping the schema here would
 * break native models, so we must keep the bare shape.
 *
 * The AI SDK's structured-output `name` / `description` (from
 * `Output.object({ schema, name, description })` / `generateObject`) would
 * otherwise be silently dropped on this path. We preserve them as the standard
 * JSON Schema `title` (from `name`) and `description` keywords, which keeps the
 * payload a valid bare schema while still passing the LLM guidance through.
 *
 * Existing schema-level `title` / `description` are never overwritten, empty
 * strings are ignored, and the input schema object is never mutated.
 *
 * See https://github.com/cloudflare/ai/issues/559.
 */
export function buildJsonSchemaPayload(
	schema: unknown,
	name?: string,
	description?: string,
): unknown {
	// Only objects can carry JSON Schema keywords. Anything else (incl.
	// `undefined` when no schema was supplied) passes through untouched.
	if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
		return schema;
	}

	const record = schema as Record<string, unknown>;
	const addTitle = !!name && record.title === undefined;
	const addDescription = !!description && record.description === undefined;

	if (!addTitle && !addDescription) {
		return schema;
	}

	return {
		...record,
		...(addTitle ? { title: name } : {}),
		...(addDescription ? { description } : {}),
	};
}

// ---------------------------------------------------------------------------
// Tool preparation
// ---------------------------------------------------------------------------

export function prepareToolsAndToolChoice(
	tools: Parameters<LanguageModelV4["doGenerate"]>[0]["tools"],
	toolChoice: Parameters<LanguageModelV4["doGenerate"]>[0]["toolChoice"],
) {
	if (tools == null) {
		return { tool_choice: undefined, tools: undefined };
	}

	const mappedTools = tools.map((tool) => ({
		function: {
			description: tool.type === "function" ? tool.description : undefined,
			name: tool.name,
			parameters: tool.type === "function" ? tool.inputSchema : undefined,
		},
		type: "function",
	}));

	if (toolChoice == null) {
		return { tool_choice: undefined, tools: mappedTools };
	}

	const type = toolChoice.type;

	switch (type) {
		case "auto":
			return { tool_choice: type, tools: mappedTools };
		case "none":
			return { tool_choice: type, tools: mappedTools };
		case "required":
			return { tool_choice: "required", tools: mappedTools };

		// Force a specific tool via the OpenAI-style named-function form.
		// Workers AI enforces this server-side, unlike "required" which is
		// advisory and "fails open" on long contexts / reasoning models (the
		// model can answer in prose instead of calling the tool). The full tool
		// list is kept (not filtered to the single function) to match OpenAI
		// semantics and preserve tool-result context fidelity.
		// See https://github.com/cloudflare/ai/issues/560.
		case "tool":
			return {
				tool_choice: { type: "function", function: { name: toolChoice.toolName } },
				tools: mappedTools,
			};
		default: {
			const exhaustiveCheck = type satisfies never;
			throw new Error(`Unsupported tool choice type: ${exhaustiveCheck}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tool call processing
// ---------------------------------------------------------------------------

const TOOL_CALL_ID_MARKER = "::cf-wai-tool-call::";

export function createAISDKToolCallId(toolCallId: string | null | undefined): string {
	const originalId = toolCallId || generateId();
	return `${originalId}${TOOL_CALL_ID_MARKER}${generateId()}`;
}

export function toWorkersAIToolCallId(toolCallId: string): string {
	const markerIndex = toolCallId.lastIndexOf(TOOL_CALL_ID_MARKER);
	if (markerIndex === -1) return toolCallId;

	const suffixIndex = markerIndex + TOOL_CALL_ID_MARKER.length;
	if (suffixIndex >= toolCallId.length) return toolCallId;

	return toolCallId.slice(0, markerIndex);
}

/** Workers AI flat tool call format (non-streaming, native) */
interface FlatToolCall {
	name: string;
	arguments: unknown;
	id?: string;
}

/** Workers AI OpenAI-compatible tool call format */
interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: unknown;
	};
}

/** Partial tool call from streaming (has index for merging) */
interface PartialToolCall {
	index?: number;
	id?: string;
	type?: string;
	function?: {
		name?: string;
		arguments?: string;
	};
	// Flat format fields
	name?: string;
	arguments?: string;
}

function mergePartialToolCalls(partialCalls: PartialToolCall[]) {
	const mergedCallsByIndex: Record<
		number,
		{ function: { arguments: string; name: string }; id: string; type: string }
	> = {};

	for (const partialCall of partialCalls) {
		const index = partialCall.index ?? 0;

		if (!mergedCallsByIndex[index]) {
			mergedCallsByIndex[index] = {
				function: {
					arguments: "",
					name: partialCall.function?.name || "",
				},
				id: partialCall.id || "",
				type: partialCall.type || "",
			};
		} else {
			if (partialCall.id) {
				mergedCallsByIndex[index].id = partialCall.id;
			}
			if (partialCall.type) {
				mergedCallsByIndex[index].type = partialCall.type;
			}
			if (partialCall.function?.name) {
				mergedCallsByIndex[index].function.name = partialCall.function.name;
			}
		}

		// Append arguments if available (they arrive in order during streaming)
		if (partialCall.function?.arguments) {
			mergedCallsByIndex[index].function.arguments += partialCall.function.arguments;
		}
	}

	return Object.values(mergedCallsByIndex);
}

function processToolCall(toolCall: FlatToolCall | OpenAIToolCall): LanguageModelV4ToolCall {
	// OpenAI format: has function.name (the key discriminator)
	const fn =
		"function" in toolCall && typeof toolCall.function === "object" && toolCall.function
			? (toolCall.function as { name?: string; arguments?: unknown })
			: null;

	if (fn?.name) {
		return {
			input:
				typeof fn.arguments === "string"
					? fn.arguments
					: JSON.stringify(fn.arguments || {}),
			toolCallId: createAISDKToolCallId(toolCall.id),
			type: "tool-call",
			toolName: fn.name,
		};
	}

	// Flat format (native Workers AI non-streaming): has top-level name
	const flat = toolCall as FlatToolCall;
	return {
		input:
			typeof flat.arguments === "string"
				? flat.arguments
				: JSON.stringify(flat.arguments || {}),
		toolCallId: createAISDKToolCallId(flat.id),
		type: "tool-call",
		toolName: flat.name,
	};
}

export function processToolCalls(output: Record<string, unknown>): LanguageModelV4ToolCall[] {
	if (output.tool_calls && Array.isArray(output.tool_calls)) {
		return output.tool_calls.map((toolCall: FlatToolCall | OpenAIToolCall) =>
			processToolCall(toolCall),
		);
	}

	const choices = output.choices as
		| Array<{ message?: { tool_calls?: Array<FlatToolCall | OpenAIToolCall> } }>
		| undefined;
	if (choices?.[0]?.message?.tool_calls && Array.isArray(choices[0].message.tool_calls)) {
		return choices[0].message.tool_calls.map((toolCall) => processToolCall(toolCall));
	}

	return [];
}

export function processPartialToolCalls(partialToolCalls: PartialToolCall[]) {
	const mergedToolCalls = mergePartialToolCalls(partialToolCalls);
	return processToolCalls({ tool_calls: mergedToolCalls });
}

// ---------------------------------------------------------------------------
// Forced tool-call salvage (gpt-oss harmony quirk)
// ---------------------------------------------------------------------------

/**
 * Parse tool calls that a model leaked as JSON text instead of structured
 * `tool_calls`, assigning AI-SDK tool-call ids.
 *
 * The recovery logic (which JSON shapes count as a leaked call) lives in
 * `@cloudflare/gateway-core`; this wrapper only layers the framework id on each
 * neutral result so the existing `LanguageModelV4ToolCall` shape is preserved.
 */
export function parseLeakedToolCalls(
	text: string,
	knownToolNames: Set<string>,
): LanguageModelV4ToolCall[] {
	return coreParseLeakedToolCalls(text, knownToolNames).map((call) => ({
		input: call.input,
		toolCallId: createAISDKToolCallId(undefined),
		type: "tool-call",
		toolName: call.toolName,
	}));
}

/**
 * Salvage a tool call that a model leaked into text content instead of the
 * structured `tool_calls` field.
 *
 * Workers AI's gpt-oss models (harmony format) sometimes emit a forced tool
 * call as raw JSON in `message.content` with an empty `tool_calls` array and
 * `finish_reason: "stop"` — typically when the forced tool is a poor fit for
 * the conversation. The content looks like one of:
 *
 *   {"name":"read_skill_resource","path":"feedback.txt"}        (flat args)
 *   {"name":"calc","arguments":{"a":1}}                          (wrapped args)
 *   [{"name":"calc","parameters":{"a":1}}]                       (array form)
 *
 * This reinterprets that text as a structured tool call. It is intentionally
 * narrow to avoid false positives:
 *   - only runs when a tool was *forced* (required / named-function), so a
 *     tool call was explicitly demanded by the caller;
 *   - only runs when there are no real structured tool calls to override;
 *   - only matches JSON objects whose `name` is one of the requested tools.
 *
 * Returns the salvaged tool calls, or `null` when nothing was salvaged.
 *
 * See https://github.com/cloudflare/ai/issues/560.
 */
export function salvageToolCallsFromText(
	output: Record<string, unknown>,
	context: {
		tools: Array<{ function: { name?: string } }> | undefined;
		toolChoice: unknown;
	},
): LanguageModelV4ToolCall[] | null {
	if (!isForcedToolChoice(context.toolChoice)) return null;

	// Never override real tool calls.
	if (processToolCalls(output).length > 0) return null;

	const knownToolNames = getToolNames(context.tools);
	if (knownToolNames.size === 0) return null;

	const text = processText(output);
	if (!text) return null;

	const salvaged = parseLeakedToolCalls(text, knownToolNames);
	return salvaged.length > 0 ? salvaged : null;
}
