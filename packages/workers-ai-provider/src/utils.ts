import type { LanguageModelV2, LanguageModelV2ToolCall } from "@ai-sdk/provider";

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
		// biome-ignore lint/correctness/noUnusedVariables: they need to be destructured
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
			} catch (_error) {
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
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		};

		const body = JSON.stringify(inputs);

		// Execute the POST request. The optional AbortSignal is applied here.
		const response = await fetch(url, {
			body,
			headers,
			method: "POST",
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
	tools: Parameters<LanguageModelV2["doGenerate"]>[0]["tools"],
	toolChoice: Parameters<LanguageModelV2["doGenerate"]>[0]["toolChoice"],
) {
	if (tools == null) {
		return { tool_choice: undefined, tools: undefined };
	}

	const mappedTools = tools.map((tool) => ({
		function: {
			description: tool.type === "function" && tool.description,
			name: tool.name,
			inputSchema: tool.type === "function" && tool.inputSchema,
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
			return { tool_choice: "any", tools: mappedTools };

		// workersAI does not support tool mode directly,
		// so we filter the tools and force the tool choice through 'any'
		case "tool":
			return {
				tool_choice: "any",
				tools: mappedTools.filter((tool) => tool.function.name === toolChoice.toolName),
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

		// Append arguments if available, this assumes arguments come in the right order
		if (partialCall.function?.arguments) {
			mergedCallsByIndex[index].function.arguments += partialCall.function.arguments;
		}
	}

	return Object.values(mergedCallsByIndex);
}

function processToolCall(toolCall: any): LanguageModelV2ToolCall {
	// Check for OpenAI format tool calls first
	if (toolCall.function && toolCall.id) {
		return {
			input:
				typeof toolCall.function.arguments === "string"
					? toolCall.function.arguments
					: JSON.stringify(toolCall.function.arguments || {}),
			toolCallId: toolCall.id,
			type: "tool-call",
			toolName: toolCall.function.name,
		};
	}
	return {
		input:
			typeof toolCall.arguments === "string"
				? toolCall.arguments
				: JSON.stringify(toolCall.arguments || {}),
		toolCallId: toolCall.name,
		type: "tool-call",
		toolName: toolCall.name,
	};
}

export function processToolCalls(output: any): LanguageModelV2ToolCall[] {
	if (output.tool_calls && Array.isArray(output.tool_calls)) {
		return output.tool_calls.map((toolCall: any) => {
			const processedToolCall = processToolCall(toolCall);
			return processedToolCall;
		});
	}

	if (
		output?.choices?.[0]?.message?.tool_calls &&
		Array.isArray(output.choices[0].message.tool_calls)
	) {
		return output.choices[0].message.tool_calls.map((toolCall: any) => {
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

export function processText(output: AiTextGenerationOutput): string | undefined {
	// @ts-expect-error OpenAI format not typed yet
	if (output?.choices?.[0]?.message?.content?.length) {
		// @ts-expect-error OpenAI format not typed yet
		return output?.choices?.[0]?.message?.content;
	}

	if ("response" in output) {
		if (typeof output.response === "object" && output.response !== null) {
			return JSON.stringify(output.response); // ai-sdk expects a string here
		}

		return output.response;
	}
}
