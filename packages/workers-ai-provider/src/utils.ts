import type { LanguageModelV3, LanguageModelV3ToolCall } from "@ai-sdk/provider";
import { generateId } from "ai";
import type { WorkersAIChatPrompt } from "./workersai-chat-prompt";

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
	return messages.map((msg) => {
		const normalized = { ...msg };

		// content: null → content: ""
		if (normalized.content === null || normalized.content === undefined) {
			(normalized as { content: string }).content = "";
		}

		return normalized;
	});
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

		// Check for HTTP errors before processing
		if (!response.ok && !returnRawResponse) {
			let errorBody: string;
			try {
				errorBody = await response.text();
			} catch {
				errorBody = "<unable to read response body>";
			}
			throw new Error(
				`Workers AI API error (${response.status} ${response.statusText}): ${errorBody}`,
			);
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
				throw new Error(
					`Workers AI API error (${retryResponse.status} ${retryResponse.statusText}): ${errorBody}`,
				);
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
		throw new Error(
			`Workers AI API error (${response.status} ${response.statusText}): ${errorBody}`,
		);
	}

	const data = await response.json<{ result?: Record<string, unknown> }>();
	return (data.result ?? data) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tool preparation
// ---------------------------------------------------------------------------

export function prepareToolsAndToolChoice(
	tools: Parameters<LanguageModelV3["doGenerate"]>[0]["tools"],
	toolChoice: Parameters<LanguageModelV3["doGenerate"]>[0]["toolChoice"],
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

		// Workers AI does not support tool mode directly,
		// so we filter the tools and force the tool choice through 'required'
		case "tool":
			return {
				tool_choice: "required",
				tools: mappedTools.filter((tool) => tool.function.name === toolChoice.toolName),
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

function processToolCall(toolCall: FlatToolCall | OpenAIToolCall): LanguageModelV3ToolCall {
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
			toolCallId: toolCall.id || generateId(),
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
		toolCallId: flat.id || generateId(),
		type: "tool-call",
		toolName: flat.name,
	};
}

export function processToolCalls(output: Record<string, unknown>): LanguageModelV3ToolCall[] {
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
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Extract text from a Workers AI response, handling multiple response formats:
 * - OpenAI format: { choices: [{ message: { content: "..." } }] }
 * - Native format: { response: "..." }
 * - Structured output quirk: { response: { ... } } (object instead of string)
 * - Structured output quirk: { response: "{ ... }" } (JSON string)
 */
export function processText(output: Record<string, unknown>): string | undefined {
	// OpenAI format
	const choices = output.choices as Array<{ message?: { content?: string | null } }> | undefined;
	const choiceContent = choices?.[0]?.message?.content;
	if (choiceContent != null && String(choiceContent).length > 0) {
		return String(choiceContent);
	}

	if ("response" in output) {
		const response = output.response;
		// Object response (structured output quirk #2)
		if (typeof response === "object" && response !== null) {
			return JSON.stringify(response);
		}
		// Numeric response (quirk #9)
		if (typeof response === "number") {
			return String(response);
		}
		// Null response (e.g., tool-call-only responses)
		if (response === null || response === undefined) {
			return undefined;
		}
		return String(response);
	}
	return undefined;
}
