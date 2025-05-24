import type { LanguageModelV1, LanguageModelV1FunctionToolCall } from "@ai-sdk/provider";

/**
 * General AI run interface with overloads to handle distinct return types.
 *
 * The behaviour depends on the combination of parameters:
 * 1. `returnRawResponse: true` => returns the raw Response object.
 * 2. `stream: true`           => returns a ReadableStream (if available).
 * 3. Otherwise                => returns post-processed AI results.
 */
export interface AiRun {
	// (1) Return raw Response if `options.returnRawResponse` is `true`.
	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options: AiOptions & { returnRawResponse: true },
	): Promise<Response>;

	// (2) Return a stream if the input has `stream: true`.
	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"] & { stream: true },
		options?: AiOptions,
	): Promise<ReadableStream<Uint8Array>>;

	// (3) Return post-processed outputs by default.
	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options?: AiOptions,
	): Promise<AiModels[Name]["postProcessedOutputs"]>;
}

export type StringLike = string | { toString(): string };

/**
 * Parameters for configuring the Cloudflare-based AI runner.
 */
export interface CreateRunConfig {
	/** Your Cloudflare account identifier. */
	accountId: string;

	/** Cloudflare API token/key with appropriate permissions. */
	apiKey: string;
}

/**
 * Creates a run method that emulates the Cloudflare Workers AI binding,
 * but uses the Cloudflare REST API under the hood. Headers and abort
 * signals are configured at creation time, rather than per-request.
 *
 * @param config An object containing:
 *   - `accountId`: Cloudflare account identifier.
 *   - `apiKey`: Cloudflare API token/key with suitable permissions.
 *   - `headers`: Optional custom headers to merge with defaults.
 *   - `signal`: Optional AbortSignal for request cancellation.
 *
 * @returns A function matching the AiRun interface.
 */
export function createRun(config: CreateRunConfig): AiRun {
	const { accountId, apiKey } = config;

	// Return the AiRun-compatible function.
	return async function run<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options?: AiOptions & Record<string, StringLike>,
	): Promise<Response | ReadableStream<Uint8Array> | AiModels[Name]["postProcessedOutputs"]> {
		const { gateway, prefix, extraHeaders, returnRawResponse, ...passthroughOptions } =
			options || {};

		const urlParams = new URLSearchParams();
		for (const [key, value] of Object.entries(passthroughOptions)) {
			// throw a useful error if the value is not to-stringable
			try {
				const valueStr = value.toString();
				if (!valueStr) {
					continue;
				}
				urlParams.append(key, valueStr);
			} catch (error) {
				throw new Error(
					`Value for option '${key}' is not able to be coerced into a string.`,
				);
			}
		}

		const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}${
			urlParams ? `?${urlParams}` : ""
		}`;

		// Merge default and custom headers.
		const headers = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		};

		const body = JSON.stringify(inputs);

		// Execute the POST request. The optional AbortSignal is applied here.
		const response = await fetch(url, {
			method: "POST",
			headers,
			body,
		});

		// (1) If the user explicitly requests the raw Response, return it as-is.
		if (returnRawResponse) {
			return response;
		}

		// (2) If the AI input requests streaming, return the ReadableStream if available.
		if ((inputs as AiTextGenerationInput).stream === true) {
			if (response.body) {
				return response.body;
			}
			throw new Error("No readable body available for streaming.");
		}

		// (3) In all other cases, parse JSON and return the result field.
		const data = await response.json<{
			result: AiModels[Name]["postProcessedOutputs"];
		}>();
		return data.result;
	};
}

export function prepareToolsAndToolChoice(
	mode: Parameters<LanguageModelV1["doGenerate"]>[0]["mode"] & {
		type: "regular";
	},
) {
	// when the tools array is empty, change it to undefined to prevent errors:
	const tools = mode.tools?.length ? mode.tools : undefined;

	if (tools == null) {
		return { tools: undefined, tool_choice: undefined };
	}

	const mappedTools = tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			// @ts-expect-error - description is not a property of tool
			description: tool.description,
			// @ts-expect-error - parameters is not a property of tool
			parameters: tool.parameters,
		},
	}));

	const toolChoice = mode.toolChoice;

	if (toolChoice == null) {
		return { tools: mappedTools, tool_choice: undefined };
	}

	const type = toolChoice.type;

	switch (type) {
		case "auto":
			return { tools: mappedTools, tool_choice: type };
		case "none":
			return { tools: mappedTools, tool_choice: type };
		case "required":
			return { tools: mappedTools, tool_choice: "any" };

		// workersAI does not support tool mode directly,
		// so we filter the tools and force the tool choice through 'any'
		case "tool":
			return {
				tools: mappedTools.filter((tool) => tool.function.name === toolChoice.toolName),
				tool_choice: "any",
			};
		default: {
			const exhaustiveCheck = type satisfies never;
			throw new Error(`Unsupported tool choice type: ${exhaustiveCheck}`);
		}
	}
}

export function lastMessageWasUser<T extends { role: string }>(messages: T[]) {
	return messages.length > 0 && messages[messages.length - 1]!.role === "user";
}

function mergePartialToolCalls(partialCalls: any[]) {
	const mergedCallsByIndex: any = {};

	for (const partialCall of partialCalls) {
		const index = partialCall.index;

		if (!mergedCallsByIndex[index]) {
			mergedCallsByIndex[index] = {
				id: partialCall.id || "",
				type: partialCall.type || "",
				function: {
					name: partialCall.function?.name || "",
					arguments: "",
				},
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

		// Append arguments if available, this assumes arguments come in the right order
		if (partialCall.function?.arguments) {
			mergedCallsByIndex[index].function.arguments += partialCall.function.arguments;
		}
	}

	return Object.values(mergedCallsByIndex);
}

function processToolCall(toolCall: any): LanguageModelV1FunctionToolCall {
	if (toolCall.function && toolCall.id) {
		return {
			toolCallType: "function",
			toolCallId: toolCall.id,
			toolName: toolCall.function.name,
			args:
				typeof toolCall.function.arguments === "string"
					? toolCall.function.arguments
					: JSON.stringify(toolCall.function.arguments || {}),
		};
	}
	return {
		toolCallType: "function",
		toolCallId: toolCall.name,
		toolName: toolCall.name,
		args:
			typeof toolCall.arguments === "string"
				? toolCall.arguments
				: JSON.stringify(toolCall.arguments || {}),
	};
}

export function processToolCalls(output: any): LanguageModelV1FunctionToolCall[] {
	// Check for OpenAI format tool calls first
	if (output.tool_calls && Array.isArray(output.tool_calls)) {
		return output.tool_calls.map((toolCall: any) => {
			const processedToolCall = processToolCall(toolCall);
			return processedToolCall;
		});
	}

	return [];
}

export function processPartialToolCalls(partialToolCalls: any[]) {
	const mergedToolCalls = mergePartialToolCalls(partialToolCalls);
	return processToolCalls({ tool_calls: mergedToolCalls });
}
