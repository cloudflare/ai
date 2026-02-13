// ---------------------------------------------------------------------------
// AI Gateway types (for third-party providers + Workers AI through gateway)
// ---------------------------------------------------------------------------

export interface CloudflareAiGateway {
	run(request: unknown): Promise<Response>;
}

export interface AiGatewayBindingConfig {
	/**
	 * The AI Gateway binding
	 * @example
	 * env.AI.gateway('my-gateway-id')
	 */
	binding: CloudflareAiGateway;
	/**
	 * The Provider API Key if you want to manually pass it, ignore if using Unified Billing or BYOK.
	 */
	apiKey?: string;
}

export interface AiGatewayCredentialsConfig {
	/**
	 * The Cloudflare account ID
	 */
	accountId: string;
	/**
	 * The AI Gateway ID
	 */
	gatewayId: string;
	/**
	 * The Provider API Key if you want to manually pass it, ignore if using Unified Billing or BYOK.
	 */
	apiKey?: string;
	/**
	 * The Cloudflare AI Gateway API Key, required if your Gateway is authenticated.
	 */
	cfApiKey?: string;
}

export interface AiGatewayConfig {
	skipCache?: boolean;
	cacheTtl?: number;
	customCacheKey?: string;
	metadata?: Record<string, unknown>;
}

export type AiGatewayAdapterConfig = (AiGatewayBindingConfig | AiGatewayCredentialsConfig) &
	AiGatewayConfig;

// ---------------------------------------------------------------------------
// Plain Workers AI types (direct binding or REST, no gateway)
// ---------------------------------------------------------------------------

/**
 * The Workers AI binding interface (env.AI).
 * Accepts a model name and inputs, returns results directly.
 * Includes `gateway()` which is present on `env.AI` but not on `env.AI.gateway(id)`,
 * enabling structural discrimination from `CloudflareAiGateway`.
 */
export interface WorkersAiBinding {
	run(
		model: string,
		inputs: Record<string, unknown>,
		options?: Record<string, unknown>,
	): Promise<unknown>;
	gateway(gatewayId: string): CloudflareAiGateway;
}

export interface WorkersAiDirectBindingConfig {
	/**
	 * The Workers AI binding (env.AI).
	 * @example
	 * { binding: env.AI }
	 */
	binding: WorkersAiBinding;
}

export interface WorkersAiDirectCredentialsConfig {
	/**
	 * The Cloudflare account ID
	 */
	accountId: string;
	/**
	 * The Cloudflare API key for Workers AI
	 */
	apiKey: string;
}

/**
 * Config for Workers AI adapters. Supports four modes:
 * - Plain binding: `{ binding: env.AI }`
 * - Plain REST: `{ accountId, apiKey }`
 * - AI Gateway binding: `{ binding: env.AI.gateway(id) }`
 * - AI Gateway REST: `{ accountId, gatewayId, ... }`
 *
 * The third union member intersects `AiGatewayAdapterConfig` with `{ apiKey?: string }`.
 * For the gateway binding variant, `AiGatewayBindingConfig` already includes `apiKey?`,
 * so the intersection is redundant there. For the gateway credentials variant, this
 * `apiKey` represents the Workers AI token (used in the `Authorization` header to the
 * upstream provider), distinct from `cfApiKey` (used in the `cf-aig-authorization`
 * header for authenticated gateways).
 */
export type WorkersAiAdapterConfig =
	| WorkersAiDirectBindingConfig
	| WorkersAiDirectCredentialsConfig
	| (AiGatewayAdapterConfig & { apiKey?: string });

// ---------------------------------------------------------------------------
// Config detection helpers
// ---------------------------------------------------------------------------

/** Returns true if this is a plain Workers AI binding config (`{ binding: env.AI }`) */
export function isDirectBindingConfig(
	config: WorkersAiAdapterConfig,
): config is WorkersAiDirectBindingConfig {
	// env.AI has a .gateway() method; env.AI.gateway(id) does not.
	// This distinguishes direct bindings from AI Gateway bindings.
	return (
		"binding" in config &&
		typeof (config.binding as unknown as Record<string, unknown>).gateway === "function"
	);
}

/** Returns true if this is a plain Workers AI REST config (accountId + apiKey, no gatewayId) */
export function isDirectCredentialsConfig(
	config: WorkersAiAdapterConfig,
): config is WorkersAiDirectCredentialsConfig {
	return "accountId" in config && "apiKey" in config && !("gatewayId" in config);
}

/** Returns true if this is an AI Gateway config (has gateway binding or `gatewayId`) */
export function isGatewayConfig(config: WorkersAiAdapterConfig): config is AiGatewayAdapterConfig {
	if ("gatewayId" in config) return true;
	// Has `binding` but NOT a direct Workers AI binding (no .gateway method)
	return "binding" in config && !isDirectBindingConfig(config);
}

// ---------------------------------------------------------------------------
// createGatewayFetch -- for routing through AI Gateway
// ---------------------------------------------------------------------------

export function createGatewayFetch(
	provider: string,
	config: AiGatewayAdapterConfig,
	headers: Record<string, string> = {},
): typeof fetch {
	return (input, init) => {
		let query: Record<string, unknown> = {};

		const url =
			typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const urlObj = new URL(url);

		// Extract endpoint path (remove /v1/ prefix if present)
		const endpoint = urlObj.pathname.replace(/^\/v1\//, "").replace(/^\//, "") + urlObj.search;

		if (init?.body) {
			try {
				query = JSON.parse(init.body as string);
			} catch {
				query = { _raw: init.body };
			}
		}

		const cacheHeaders: Record<string, string> = {};

		if ("skipCache" in config && config.skipCache) {
			cacheHeaders["cf-aig-skip-cache"] = "true";
		}

		if (typeof config.cacheTtl === "number") {
			cacheHeaders["cf-aig-cache-ttl"] = String(config.cacheTtl);
		}

		if (typeof config.customCacheKey === "string") {
			cacheHeaders["cf-aig-cache-key"] = config.customCacheKey;
		}

		if (typeof config.metadata === "object") {
			cacheHeaders["cf-aig-metadata"] = JSON.stringify(config.metadata);
		}

		const request: {
			provider: string;
			endpoint: string;
			headers: Record<string, string>;
			query: Record<string, unknown>;
		} = {
			provider,
			endpoint,
			headers: {
				...(init?.headers as Record<string, string> | undefined),
				...headers,
				...cacheHeaders,
				"Content-Type": "application/json",
			},
			query,
		};

		if (provider === "workers-ai") {
			request.endpoint = `run/${query.model}`;
			delete query.model;
			delete query.instructions;
		}

		if (config.apiKey) {
			request.headers["authorization"] = `Bearer ${config.apiKey}`;
		}

		if ("binding" in config) {
			return config.binding.run(request);
		}

		return fetch(
			`https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}`,
			{
				...init,
				headers: {
					"Content-Type": "application/json",
					...headers,
					...cacheHeaders,
					...(config.cfApiKey
						? { "cf-aig-authorization": `Bearer ${config.cfApiKey}` }
						: {}),
				},
				body: JSON.stringify(request),
			},
		);
	};
}

// ---------------------------------------------------------------------------
// createWorkersAiBindingFetch -- shim that makes env.AI look like an OpenAI endpoint
// ---------------------------------------------------------------------------

/**
 * Normalize messages before passing to Workers AI binding.
 *
 * The binding has strict schema validation that may differ from the OpenAI API:
 * - `content` must be a string (not null)
 * - `tool_call_id` must match `[a-zA-Z0-9]{9}` pattern
 *
 * This function patches these fields so that the full tool-call round-trip works
 * even though the binding's own generated IDs may not pass its validation.
 */
function normalizeMessagesForBinding(
	messages: Record<string, unknown>[],
): Record<string, unknown>[] {
	return messages.map((msg) => {
		const normalized = { ...msg };

		// content: null → content: ""
		if (normalized.content === null || normalized.content === undefined) {
			normalized.content = "";
		}

		// Normalize tool_call_id on tool messages
		if (normalized.tool_call_id && typeof normalized.tool_call_id === "string") {
			normalized.tool_call_id = sanitizeToolCallId(normalized.tool_call_id);
		}

		// Normalize tool_calls[].id on assistant messages
		if (Array.isArray(normalized.tool_calls)) {
			normalized.tool_calls = (normalized.tool_calls as Record<string, unknown>[]).map(
				(tc) => {
					if (tc.id && typeof tc.id === "string") {
						return { ...tc, id: sanitizeToolCallId(tc.id) };
					}
					return tc;
				},
			);
		}

		return normalized;
	});
}

/**
 * Strip non-alphanumeric characters and ensure the ID is exactly 9 chars,
 * matching Workers AI's `[a-zA-Z0-9]{9}` validation pattern.
 *
 * **Why this exists:** The Workers AI binding validates `tool_call_id` with
 * a strict `[a-zA-Z0-9]{9}` regex, but it *generates* IDs like
 * `chatcmpl-tool-875d3ec6179676ae` (with dashes, >9 chars). Those IDs are
 * then rejected when sent back in a follow-up request. This is a known
 * Workers AI issue — see workers-ai.md (Issue 3). Once the Workers AI team
 * fixes the validation, this function becomes an idempotent no-op for
 * IDs that already match the pattern.
 */
function sanitizeToolCallId(id: string): string {
	const alphanumeric = id.replace(/[^a-zA-Z0-9]/g, "");
	// Pad with zeros if too short, truncate if too long
	return alphanumeric.slice(0, 9).padEnd(9, "0");
}

/**
 * Creates a fetch function that intercepts OpenAI SDK requests and translates them
 * to Workers AI binding calls (env.AI.run). This allows the WorkersAiTextAdapter
 * to use the OpenAI SDK against a plain Workers AI binding.
 *
 * NOTE: The `input` URL parameter is intentionally ignored. The model name and all
 * request parameters are extracted from the JSON body, matching Workers AI's
 * `binding.run(model, inputs)` calling convention.
 */
export function createWorkersAiBindingFetch(binding: WorkersAiBinding): typeof fetch {
	return async (_input, init) => {
		if (!init?.body) {
			return new Response("No body", { status: 400 });
		}

		let body: Record<string, unknown>;
		try {
			body = JSON.parse(init.body as string);
		} catch {
			return new Response("Invalid JSON body", { status: 400 });
		}

		const model = body.model as string;
		const stream = body.stream as boolean | undefined;

		// Build Workers AI inputs from OpenAI format
		const inputs: Record<string, unknown> = {};
		if (body.messages) {
			inputs.messages = normalizeMessagesForBinding(
				body.messages as Record<string, unknown>[],
			);
		}
		if (body.tools) inputs.tools = body.tools;
		if (typeof body.temperature === "number") inputs.temperature = body.temperature;
		if (typeof body.max_tokens === "number") inputs.max_tokens = body.max_tokens;
		if (body.response_format) inputs.response_format = body.response_format;
		if (stream) inputs.stream = true;

		const result = await binding.run(model, inputs);

		if (stream && result instanceof ReadableStream) {
			// Workers AI returns an SSE stream with `data: {"response":"chunk"}` format.
			// Transform it to OpenAI-compatible SSE format.
			const transformed = transformWorkersAiStream(
				result as ReadableStream<Uint8Array>,
				model,
			);
			return new Response(transformed, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
				},
			});
		}

		// Graceful degradation: some models return a complete (non-streaming)
		// response even when `stream: true` is requested. Fall through to the
		// non-streaming wrapper which produces a valid OpenAI Chat Completion
		// response that the SDK can consume.

		// Non-streaming: Workers AI returns { response: "text", tool_calls?: [...] }
		// Wrap into OpenAI Chat Completion format.
		const responseObj =
			typeof result === "object" && result !== null
				? (result as Record<string, unknown>)
				: { response: String(result) };

		const responseText = typeof responseObj.response === "string" ? responseObj.response : "";

		const message: Record<string, unknown> = {
			role: "assistant",
			content: responseText,
		};
		let finishReason = "stop";

		// Handle tool calls if present in Workers AI response
		if (Array.isArray(responseObj.tool_calls) && responseObj.tool_calls.length > 0) {
			finishReason = "tool_calls";
			message.tool_calls = responseObj.tool_calls.map(
				(tc: {
					id?: string;
					name?: string;
					arguments: unknown;
					function?: { name: string; arguments?: unknown };
				}) => ({
					id: sanitizeToolCallId(tc.id || crypto.randomUUID()),
					type: "function",
					function: {
						name: tc.function?.name || tc.name || "",
						arguments:
							typeof (tc.function?.arguments ?? tc.arguments) === "string"
								? ((tc.function?.arguments ?? tc.arguments) as string)
								: JSON.stringify(tc.function?.arguments ?? tc.arguments ?? {}),
					},
				}),
			);
		}

		const openAiResponse = {
			id: `workers-ai-${crypto.randomUUID()}`,
			object: "chat.completion",
			created: Math.floor(Date.now() / 1000),
			model,
			choices: [{ index: 0, message, finish_reason: finishReason }],
		};

		return new Response(JSON.stringify(openAiResponse), {
			headers: { "Content-Type": "application/json" },
		});
	};
}

// ---------------------------------------------------------------------------
// Stream transformer: Workers AI SSE -> OpenAI-compatible SSE
// Uses TransformStream for proper backpressure.
// ---------------------------------------------------------------------------

/**
 * Transforms a Workers AI SSE stream (data: {"response":"chunk"}) into
 * an OpenAI-compatible SSE stream (data: {"choices":[{"delta":{"content":"chunk"}}]}).
 *
 * Workers AI binding streams tool calls in an OpenAI-like nested format:
 *   { tool_calls: [{ id, type, index, function: { name, arguments } }] }
 * Arguments are streamed incrementally across multiple SSE chunks, so the
 * transformer must forward them as incremental deltas rather than a single blob.
 */
function transformWorkersAiStream(
	source: ReadableStream<Uint8Array>,
	model: string,
): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	// Generate a stable ID and timestamp for the entire stream, matching OpenAI's
	// convention where all chunks in a single response share the same id/created.
	const streamId = `workers-ai-${crypto.randomUUID()}`;
	const created = Math.floor(Date.now() / 1000);
	let buffer = "";
	let hasToolCalls = false;
	// When true, the source stream is already in OpenAI format (some models
	// like Qwen3, Kimi K2.5 stream OpenAI-compatible SSE through the binding).
	// In that case, flush() should only emit [DONE] and skip the finish chunk.
	let isOpenAiFormat = false;
	// Track which tool call indices we've already emitted an `id` for,
	// so subsequent argument deltas don't duplicate the id/type/name fields.
	const emittedToolCallStart = new Set<number>();

	return source.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || !trimmed.startsWith("data: ")) continue;
					const data = trimmed.slice(6);

					// Swallow source [DONE]; we emit our own in flush()
					if (data === "[DONE]") continue;

					try {
						const parsed = JSON.parse(data);

						// Some models (Qwen3, Kimi K2.5) return OpenAI-compatible format
						// directly through the binding, with `choices[].delta.content` and
						// optional `reasoning_content`. Detect this and pass through as-is.
						if (parsed.choices !== undefined) {
							// Already OpenAI format — pass through with only tool_call_id
							// sanitization for any tool calls present.
							isOpenAiFormat = true;
							const choice = parsed.choices?.[0];
							if (choice?.delta?.tool_calls) {
								hasToolCalls = true;
								for (const tc of choice.delta.tool_calls) {
									if (tc.id && typeof tc.id === "string") {
										tc.id = sanitizeToolCallId(tc.id);
									}
								}
							}
							if (choice?.finish_reason === "tool_calls") {
								hasToolCalls = true;
							}
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`),
							);
							continue;
						}

						// --- Workers AI native format handling below ---

						// Text content
						if (parsed.response != null && parsed.response !== "") {
							const openAiChunk = {
								id: streamId,
								object: "chat.completion.chunk",
								created,
								model,
								choices: [
									{
										index: 0,
										delta: { content: parsed.response },
										finish_reason: null,
									},
								],
							};
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(openAiChunk)}\n\n`),
							);
						}

						// Tool calls — Workers AI binding streams these incrementally:
						//   Chunk A: { id, type, index, function: { name } }          — start
						//   Chunk B: { index, function: { arguments: "partial..." } }  — args delta
						//   Chunk C: { index, function: { arguments: "rest..." } }     — args delta
						//   Chunk D: { id: null, type: null, index, function: { name: null, arguments: "" } } — finalize (skip)
						if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
							for (const tc of parsed.tool_calls) {
								const tcIndex = tc.index ?? 0;

								// Resolve name and arguments from either nested or flat format
								const tcName = tc.function?.name ?? tc.name ?? null;
								const tcArgs = tc.function?.arguments ?? tc.arguments ?? null;
								const tcId = tc.id ?? null;

								// Skip finalization chunks where everything is null/empty
								if (!tcId && !tcName && (!tcArgs || tcArgs === "")) continue;

								hasToolCalls = true;

								// Build the OpenAI-compatible tool_calls delta
								const toolCallDelta: Record<string, unknown> = {
									index: tcIndex,
								};

								if (!emittedToolCallStart.has(tcIndex)) {
									// First chunk for this tool call index — emit id, type, name.
									// Use sanitizeToolCallId so the ID survives round-trip through
									// the binding's strict `[a-zA-Z0-9]{9}` validation.
									emittedToolCallStart.add(tcIndex);
									const rawId = tcId || `call${streamId}${tcIndex}`;
									toolCallDelta.id = sanitizeToolCallId(rawId);
									toolCallDelta.type = "function";
									toolCallDelta.function = {
										name: tcName || "",
										// Include arguments if they arrive in the same chunk
										arguments:
											tcArgs != null
												? typeof tcArgs === "string"
													? tcArgs
													: JSON.stringify(tcArgs)
												: "",
									};
								} else {
									// Subsequent chunks — only include arguments delta
									if (tcArgs != null && tcArgs !== "") {
										toolCallDelta.function = {
											arguments:
												typeof tcArgs === "string"
													? tcArgs
													: JSON.stringify(tcArgs),
										};
									} else {
										continue; // Nothing useful to forward
									}
								}

								const toolChunk = {
									id: streamId,
									object: "chat.completion.chunk",
									created,
									model,
									choices: [
										{
											index: 0,
											delta: { tool_calls: [toolCallDelta] },
											finish_reason: null,
										},
									],
								};
								controller.enqueue(
									encoder.encode(`data: ${JSON.stringify(toolChunk)}\n\n`),
								);
							}
						}
					} catch (e) {
						// Log malformed SSE events for debugging; don't break the stream.
						console.warn("[tanstack-ai] failed to parse SSE event:", data, e);
					}
				}
			},
			flush(controller) {
				if (!isOpenAiFormat) {
					// Workers AI native format: emit a finish chunk with stop/tool_calls
					const finalChunk = {
						id: streamId,
						object: "chat.completion.chunk",
						created,
						model,
						choices: [
							{
								index: 0,
								delta: {},
								finish_reason: hasToolCalls ? "tool_calls" : "stop",
							},
						],
					};
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
				}
				// OpenAI format already includes its own finish_reason in the stream.
				// Either way, emit a [DONE] sentinel.
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			},
		}),
	);
}
