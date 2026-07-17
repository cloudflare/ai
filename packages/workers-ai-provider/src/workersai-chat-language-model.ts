import type { LanguageModelV4, SharedV4Warning, LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { generateId } from "ai";
import { convertToWorkersAIChatMessages } from "./convert-to-workersai-chat-messages";
import { mapWorkersAIFinishReason } from "./map-workersai-finish-reason";
import { mapWorkersAIUsage } from "./map-workersai-usage";
import { getMappedStream, prependStreamStart } from "./streaming";
import {
	buildJsonSchemaPayload,
	normalizeMessagesForBinding,
	prepareToolsAndToolChoice,
	processText,
	processToolCalls,
	salvageToolCallsFromText,
} from "./utils";
import type { WorkersAIChatSettings } from "./workersai-chat-settings";
import { normalizeBindingError } from "./workersai-error";
import type { TextGenerationModels } from "./workersai-models";

type WorkersAIChatConfig = {
	provider: string;
	binding: Ai;
	gateway?: GatewayOptions;
	/** True when using a real Workers AI binding (not the REST shim). */
	isBinding: boolean;
};

/**
 * Map the unified `reasoning` call option (spec v4) to Workers AI's
 * `reasoning_effort`. Workers AI accepts "low" | "medium" | "high" | null
 * (null disables reasoning), so `minimal` and `xhigh` are clamped to the
 * nearest supported effort. `provider-default` (and absence) returns
 * undefined so the settings-level `reasoning_effort` still applies.
 */
function mapUnifiedReasoningEffort(
	reasoning: Parameters<LanguageModelV4["doGenerate"]>[0]["reasoning"],
): "low" | "medium" | "high" | null | undefined {
	switch (reasoning) {
		case undefined:
		case "provider-default":
			return undefined;
		case "none":
			return null;
		case "minimal":
			return "low";
		case "xhigh":
			return "high";
		default:
			return reasoning;
	}
}

export class WorkersAIChatLanguageModel implements LanguageModelV4 {
	readonly specificationVersion = "v4";
	readonly defaultObjectGenerationMode = "json";

	readonly supportedUrls: Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>> = {};

	readonly modelId: TextGenerationModels;
	readonly settings: WorkersAIChatSettings;

	private readonly config: WorkersAIChatConfig;

	constructor(
		modelId: TextGenerationModels,
		settings: WorkersAIChatSettings,
		config: WorkersAIChatConfig,
	) {
		this.modelId = modelId;
		this.settings = settings;
		this.config = config;
	}

	get provider(): string {
		return this.config.provider;
	}

	private getArgs({
		responseFormat,
		tools,
		toolChoice,
		maxOutputTokens,
		temperature,
		topP,
		frequencyPenalty,
		presencePenalty,
		seed,
		reasoning,
	}: Parameters<LanguageModelV4["doGenerate"]>[0]) {
		const type = responseFormat?.type ?? "text";

		const warnings: SharedV4Warning[] = [];

		if (frequencyPenalty != null) {
			warnings.push({ feature: "frequencyPenalty", type: "unsupported" });
		}

		if (presencePenalty != null) {
			warnings.push({ feature: "presencePenalty", type: "unsupported" });
		}

		if (reasoning === "minimal" || reasoning === "xhigh") {
			warnings.push({
				type: "compatibility",
				feature: "reasoning",
				details:
					`Workers AI supports reasoning_effort "low" | "medium" | "high"; ` +
					`"${reasoning}" was mapped to "${reasoning === "minimal" ? "low" : "high"}".`,
			});
		}

		const baseArgs = {
			max_tokens: maxOutputTokens,
			model: this.modelId,
			random_seed: seed,
			safe_prompt: this.settings.safePrompt,
			temperature,
			top_p: topP,
		};

		switch (type) {
			case "text": {
				return {
					args: {
						...baseArgs,
						response_format: undefined as
							| { type: string; json_schema?: unknown }
							| undefined,
						...prepareToolsAndToolChoice(tools, toolChoice),
					},
					warnings,
				};
			}

			case "json": {
				// Native Workers AI expects a BARE JSON Schema under `json_schema`
				// (not OpenAI's `{ name, schema, strict }` envelope — partner models
				// that need that go through the gateway delegate, not this path). We
				// fold the AI SDK's `name`/`description` into the schema as `title`/
				// `description` so they aren't lost. See
				// https://github.com/cloudflare/ai/issues/559.
				const json = responseFormat?.type === "json" ? responseFormat : undefined;
				return {
					args: {
						...baseArgs,
						response_format: {
							type: "json_schema",
							json_schema: buildJsonSchemaPayload(
								json?.schema,
								json?.name,
								json?.description,
							),
						},
						tools: undefined,
						tool_choice: undefined,
					},
					warnings,
				};
			}

			default: {
				const exhaustiveCheck = type satisfies never;
				throw new Error(`Unsupported type: ${exhaustiveCheck}`);
			}
		}
	}

	/**
	 * Build the inputs object for `binding.run()`, shared by doGenerate and doStream.
	 *
	 * Images are embedded inline in messages as OpenAI-compatible content
	 * arrays with `image_url` parts. Both the REST API and the binding
	 * accept this format at runtime.
	 *
	 * The binding path additionally normalises null content to empty strings.
	 *
	 * Reasoning controls (`reasoning_effort`, `chat_template_kwargs`) are
	 * forwarded here from settings. These belong on the INPUTS object, not on
	 * the 3rd-arg options / REST query string — see
	 * https://github.com/cloudflare/ai/issues/501. Per-call values from
	 * `providerOptions["workers-ai"]` override settings.
	 *
	 * `reasoning_effort: null` is a valid value ("disable reasoning"), so we
	 * check `!== undefined` rather than truthiness.
	 *
	 * The unified `reasoning` call option (spec v4) is mapped onto
	 * `reasoning_effort` between the two: an explicit per-call
	 * `providerOptions["workers-ai"].reasoning_effort` wins, then the unified
	 * option, then settings.
	 */
	private buildRunInputs(
		args: ReturnType<typeof this.getArgs>["args"],
		messages: ReturnType<typeof convertToWorkersAIChatMessages>["messages"],
		options?: {
			stream?: boolean;
			providerOptions?: Record<string, unknown>;
			reasoning?: Parameters<LanguageModelV4["doGenerate"]>[0]["reasoning"];
		},
	) {
		// The AI SDK types this as `Record<string, JSONObject>` but we defensively
		// accept anything and only treat it as a lookup if it's a plain object.
		// `"key" in x` throws for primitives, so we can't skip the typeof guard.
		const rawPerCall = options?.providerOptions?.["workers-ai"];
		const perCall: Record<string, unknown> =
			rawPerCall !== null && typeof rawPerCall === "object" && !Array.isArray(rawPerCall)
				? (rawPerCall as Record<string, unknown>)
				: {};
		const unifiedReasoningEffort = mapUnifiedReasoningEffort(options?.reasoning);
		const reasoningEffort =
			"reasoning_effort" in perCall
				? perCall.reasoning_effort
				: unifiedReasoningEffort !== undefined
					? unifiedReasoningEffort
					: this.settings.reasoning_effort;
		const chatTemplateKwargs =
			"chat_template_kwargs" in perCall
				? perCall.chat_template_kwargs
				: this.settings.chat_template_kwargs;

		return {
			max_tokens: args.max_tokens,
			messages: this.config.isBinding ? normalizeMessagesForBinding(messages) : messages,
			temperature: args.temperature,
			tools: args.tools,
			...(args.tool_choice ? { tool_choice: args.tool_choice } : {}),
			top_p: args.top_p,
			...(args.response_format ? { response_format: args.response_format } : {}),
			...(options?.stream ? { stream: true } : {}),
			...(reasoningEffort !== undefined ? { reasoning_effort: reasoningEffort } : {}),
			...(chatTemplateKwargs !== undefined
				? { chat_template_kwargs: chatTemplateKwargs }
				: {}),
		};
	}

	/**
	 * Get passthrough options for binding.run() from settings.
	 *
	 * `reasoning_effort` and `chat_template_kwargs` are explicitly excluded
	 * here — they belong on the `inputs` object (see `buildRunInputs`), not on
	 * the `options` (3rd) arg of binding.run() or the REST query string.
	 */
	private getRunOptions() {
		const {
			gateway,
			safePrompt: _safePrompt,
			sessionAffinity,
			extraHeaders,
			reasoning_effort: _reasoningEffort,
			chat_template_kwargs: _chatTemplateKwargs,
			...passthroughOptions
		} = this.settings;

		const mergedHeaders = {
			...(extraHeaders && typeof extraHeaders === "object"
				? (extraHeaders as Record<string, string>)
				: {}),
			...(sessionAffinity ? { "x-session-affinity": sessionAffinity } : {}),
		};

		return {
			gateway: this.config.gateway ?? gateway,
			...(Object.keys(mergedHeaders).length > 0 ? { extraHeaders: mergedHeaders } : {}),
			...passthroughOptions,
		};
	}

	/**
	 * Extract reasoning, text, and tool calls from a non-streaming response.
	 *
	 * Shared by `doGenerate` and `doStream`'s graceful-degradation branch (the
	 * path gpt-oss falls through, since it doesn't support `/ai/run/` streaming
	 * and is retried non-streaming). When a forced tool call was leaked into
	 * text content (gpt-oss harmony quirk), it is salvaged into a structured
	 * tool call and the leaked JSON text is suppressed. A warning is appended in
	 * place so callers can observe the reinterpretation.
	 */
	private extractContent(
		outputRecord: Record<string, unknown>,
		args: ReturnType<typeof this.getArgs>["args"],
		warnings: SharedV4Warning[],
	) {
		const choices = outputRecord.choices as
			| Array<{ message?: { reasoning_content?: string; reasoning?: string } }>
			| undefined;
		const reasoningContent =
			choices?.[0]?.message?.reasoning_content ?? choices?.[0]?.message?.reasoning;

		const toolCalls = processToolCalls(outputRecord);
		const salvaged =
			toolCalls.length === 0
				? salvageToolCallsFromText(outputRecord, {
						tools: args.tools,
						toolChoice: args.tool_choice,
					})
				: null;

		if (salvaged) {
			warnings.push({
				type: "other",
				message: `Recovered ${salvaged.length} forced tool call(s) that the model emitted as text content instead of structured tool calls (model: ${this.modelId}).`,
			});
		}

		return {
			reasoningContent,
			// Suppress the leaked JSON text when we salvaged a tool call from it.
			text: salvaged ? "" : (processText(outputRecord) ?? ""),
			toolCalls: salvaged ?? toolCalls,
			// When salvaged, the upstream finish_reason is "stop"; report
			// "tool-calls" so the response is indistinguishable from a native
			// tool call and the agentic loop continues correctly.
			finishReason: salvaged
				? ({ unified: "tool-calls", raw: "stop" } as const)
				: mapWorkersAIFinishReason(outputRecord),
		};
	}

	async doGenerate(
		options: Parameters<LanguageModelV4["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV4["doGenerate"]>>> {
		const { args, warnings } = this.getArgs(options);
		const { messages } = convertToWorkersAIChatMessages(options.prompt);

		const inputs = this.buildRunInputs(args, messages, {
			providerOptions: options.providerOptions,
			reasoning: options.reasoning,
		});
		const runOptions = this.getRunOptions();

		let output: unknown;
		try {
			output = await this.config.binding.run(
				args.model as keyof AiModels,
				inputs as AiModels[keyof AiModels]["inputs"],
				{
					...runOptions,
					signal: options.abortSignal,
				} as AiOptions,
			);
		} catch (error) {
			// Normalize binding failures (e.g. 3040 "out of capacity" → 429) into a
			// retryable APICallError so the AI SDK's maxRetries can engage.
			throw normalizeBindingError(error, {
				model: args.model,
				requestBodyValues: inputs,
			});
		}

		if (output instanceof ReadableStream) {
			throw new Error(
				"Unexpected streaming response from non-streaming request. Check that `stream: true` was not passed.",
			);
		}

		const outputRecord = output as Record<string, unknown>;
		const { reasoningContent, text, toolCalls, finishReason } = this.extractContent(
			outputRecord,
			args,
			warnings,
		);

		return {
			finishReason,
			content: [
				...(reasoningContent
					? [{ type: "reasoning" as const, text: reasoningContent }]
					: []),
				{ type: "text" as const, text },
				...toolCalls,
			],
			usage: mapWorkersAIUsage(output as Record<string, unknown>),
			warnings,
		};
	}

	async doStream(
		options: Parameters<LanguageModelV4["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV4["doStream"]>>> {
		const { args, warnings } = this.getArgs(options);
		const { messages } = convertToWorkersAIChatMessages(options.prompt);

		const inputs = this.buildRunInputs(args, messages, {
			stream: true,
			providerOptions: options.providerOptions,
			reasoning: options.reasoning,
		});
		const runOptions = this.getRunOptions();

		let response: unknown;
		try {
			response = await this.config.binding.run(
				args.model as keyof AiModels,
				inputs as AiModels[keyof AiModels]["inputs"],
				{
					...runOptions,
					signal: options.abortSignal,
				} as AiOptions,
			);
		} catch (error) {
			// Normalize binding failures (e.g. 3040 "out of capacity" → 429) into a
			// retryable APICallError so the AI SDK's maxRetries can engage.
			throw normalizeBindingError(error, {
				model: args.model,
				requestBodyValues: inputs,
			});
		}

		// If the binding returned a stream, pipe it through the SSE mapper
		if (response instanceof ReadableStream) {
			return {
				stream: prependStreamStart(
					getMappedStream(response, {
						tools: args.tools,
						toolChoice: args.tool_choice,
					}),
					warnings,
				),
			};
		}

		// Graceful degradation: some models return a non-streaming response even
		// when stream:true is requested. Wrap the complete response as a stream.
		const outputRecord = response as Record<string, unknown>;
		const { reasoningContent, text, toolCalls, finishReason } = this.extractContent(
			outputRecord,
			args,
			warnings,
		);

		let textId: string | null = null;
		let reasoningId: string | null = null;

		return {
			stream: new ReadableStream<LanguageModelV4StreamPart>({
				start(controller) {
					controller.enqueue({
						type: "stream-start",
						warnings: warnings as SharedV4Warning[],
					});

					if (reasoningContent) {
						reasoningId = generateId();
						controller.enqueue({ type: "reasoning-start", id: reasoningId });
						controller.enqueue({
							type: "reasoning-delta",
							id: reasoningId,
							delta: reasoningContent,
						});
						controller.enqueue({ type: "reasoning-end", id: reasoningId });
					}

					if (text) {
						textId = generateId();
						controller.enqueue({ type: "text-start", id: textId });
						controller.enqueue({ type: "text-delta", id: textId, delta: text });
						controller.enqueue({ type: "text-end", id: textId });
					}

					for (const toolCall of toolCalls) {
						controller.enqueue(toolCall);
					}

					controller.enqueue({
						type: "finish",
						finishReason,
						usage: mapWorkersAIUsage(response as Record<string, unknown>),
					});
					controller.close();
				},
			}),
		};
	}
}
