import {
	applyGatewayCacheHeaders,
	createResumableStream,
	type GatewayMetadata,
	getToolNames,
	isForcedToolChoice,
	normalizeMessagesForBinding,
	parseLeakedToolCalls,
	processText,
	type ResumeExpiredPolicy,
	SSEDecoder,
} from "@cloudflare/gateway-core";
import { bindingErrorToResponse } from "./errors";

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

export type AiGatewayCredentialsConfig = {
	/**
	 * The Cloudflare account ID
	 */
	accountId: string;
	/**
	 * The AI Gateway ID
	 */
	gatewayId: string;
} & (
	| {
			/** Cloudflare API Key for AI Gateway */
			cfApiKey: string;
			apiKey?: string;
	  }
	| {
			/** Provider API Key */
			apiKey: string;
			/** Cloudflare API Key for AI Gateway */
			cfApiKey?: string;
	  }
);

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
	/**
	 * AI Gateway id to route the **resumable run path** through
	 * (`env.AI.run(model, inputs, { gateway, returnRawResponse })`). Required to
	 * enable {@link WorkersAiDirectBindingConfig.resume | resume}: the run path is
	 * the only transport that surfaces a `cf-aig-run-id` to resume from. Works for
	 * both `@cf/*` models and `"<provider>/<model>"` catalog slugs.
	 */
	gateway?: string;
	/**
	 * Enable resumable streaming for the run path. A transient mid-stream drop is
	 * recovered transparently by reconnecting to the gateway resume endpoint.
	 *
	 * Requires {@link WorkersAiDirectBindingConfig.gateway | gateway} and a binding
	 * exposing `.fetch` (i.e. the direct `env.AI` binding). When no `cf-aig-run-id`
	 * is returned (e.g. the gateway path, or models that don't surface one), this
	 * is a no-op and a one-time warning is logged. Defaults to `false`.
	 */
	resume?: boolean;
	/**
	 * What to do when the resume buffer has expired (gateway 404, ~5.5 min TTL):
	 * `"error"` (default) surfaces the error into the stream; `"accept-partial"`
	 * ends the stream cleanly with whatever was already delivered.
	 */
	onResumeExpired?: ResumeExpiredPolicy;
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
export type WorkersAiAdapterConfig = (
	| WorkersAiDirectBindingConfig
	| WorkersAiDirectCredentialsConfig
	| (AiGatewayAdapterConfig & { apiKey?: string })
) & {
	/**
	 * Session affinity key for prefix-cache optimization.
	 * Routes requests with the same key to the same backend replica.
	 */
	sessionAffinity?: string;
	/**
	 * Maximum number of automatic retries for transient failures (HTTP 408 /
	 * 409 / 429 / >= 500, including the Workers AI "out of capacity" 3040 code).
	 *
	 * - **Chat** (`createWorkersAi`): forwarded to the OpenAI SDK client, which
	 *   does the retrying. Defaults to the OpenAI SDK default (2).
	 * - **Non-chat** adapters (embedding, image, TTS, transcription, summarize):
	 *   used by this package's own bounded exponential-backoff retry. Defaults
	 *   to 2. Set to `0` to disable retries.
	 */
	maxRetries?: number;
};

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
// Config validation
// ---------------------------------------------------------------------------

/**
 * Validates that a WorkersAiAdapterConfig contains a valid configuration.
 * Throws an error if neither a binding, credentials (accountId + apiKey),
 * nor a gateway configuration is provided.
 */
export function validateWorkersAiConfig(config: WorkersAiAdapterConfig): void {
	if (
		!isDirectBindingConfig(config) &&
		!isDirectCredentialsConfig(config) &&
		!isGatewayConfig(config)
	) {
		throw new Error(
			"Invalid Workers AI configuration: you must provide either a binding (e.g. { binding: env.AI }), " +
				"credentials ({ accountId, apiKey }), or a gateway configuration ({ binding: env.AI.gateway(id) } " +
				"or { accountId, gatewayId }).",
		);
	}
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

		// Delegate cf-aig-* header construction to the shared gateway-core builder
		// (single source of truth across wai + tanstack).
		const cacheHeaders: Record<string, string> = {};
		applyGatewayCacheHeaders(cacheHeaders, {
			...("skipCache" in config && config.skipCache ? { skipCache: true } : {}),
			...(typeof config.cacheTtl === "number" ? { cacheTtl: config.cacheTtl } : {}),
			...(typeof config.customCacheKey === "string"
				? { cacheKey: config.customCacheKey }
				: {}),
			...(config.metadata && typeof config.metadata === "object"
				? { metadata: config.metadata as GatewayMetadata }
				: {}),
		});

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
			if (!request.endpoint.startsWith("run/")) {
				request.endpoint = `run/${query.model}`;
			}
			delete query.model;
			delete query.instructions;
		}

		if (config.apiKey) {
			request.headers["authorization"] = `Bearer ${config.apiKey}`;
		}

		if ("binding" in config) {
			return (
				config.binding as {
					run(req: unknown, opts?: { signal?: AbortSignal }): Promise<Response>;
				}
			).run(request, { signal: init?.signal ?? undefined });
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
 * Options for {@link createWorkersAiBindingFetch}.
 */
export interface WorkersAiBindingFetchOptions {
	extraHeaders?: Record<string, string>;
	/**
	 * AI Gateway id. When set, requests dispatch through the resumable **run
	 * path** (`binding.run(model, inputs, { gateway, returnRawResponse })`) which
	 * surfaces a `cf-aig-run-id`. Leave unset for the plain binding path.
	 */
	gateway?: string;
	/** Enable resumable streaming on the run path (requires `gateway`). */
	resume?: boolean;
	/** Resume-expiry policy. Defaults to `"error"`. */
	onResumeExpired?: ResumeExpiredPolicy;
}

let warnedNoRunId = false;

let warnedSalvage = false;

/**
 * Context for the gpt-oss forced-tool-call salvage: the requested tools and the
 * tool-choice from the original request body.
 */
interface SalvageContext {
	tools?: Array<{ function: { name?: string } }>;
	toolChoice?: unknown;
}

/**
 * Wrap a Workers AI native result (`{ response, tool_calls? }`) into an OpenAI
 * Chat Completion object the OpenAI SDK can parse. Shared by the streaming
 * graceful-degradation fallback and the non-streaming path.
 *
 * When `salvageContext` indicates a tool was forced but the model leaked the
 * call as JSON text instead of structured `tool_calls`, the leaked call is
 * recovered into proper `tool_calls` (gpt-oss harmony quirk, cloudflare/ai#560).
 */
function wrapWorkersAiResultAsOpenAI(
	result: unknown,
	model: string,
	salvageContext?: SalvageContext,
): Response {
	const responseObj =
		typeof result === "object" && result !== null
			? (result as Record<string, unknown>)
			: { response: String(result) };

	const responseText =
		typeof responseObj.response === "string"
			? responseObj.response
			: typeof responseObj.response === "object" && responseObj.response !== null
				? JSON.stringify(responseObj.response)
				: "";

	const message: Record<string, unknown> = {
		role: "assistant",
		content: responseText,
	};
	let finishReason = "stop";

	const hasStructuredToolCalls =
		Array.isArray(responseObj.tool_calls) && responseObj.tool_calls.length > 0;

	if (hasStructuredToolCalls) {
		finishReason = "tool_calls";
		const toolCalls = responseObj.tool_calls as Array<{
			id?: string;
			name?: string;
			arguments?: unknown;
			function?: { name?: string; arguments?: unknown };
		}>;
		message.tool_calls = toolCalls.map((tc) => ({
			id: tc.id || crypto.randomUUID(),
			type: "function",
			function: {
				name: tc.function?.name || tc.name || "",
				arguments:
					typeof (tc.function?.arguments ?? tc.arguments) === "string"
						? ((tc.function?.arguments ?? tc.arguments) as string)
						: JSON.stringify(tc.function?.arguments ?? tc.arguments ?? {}),
			},
		}));
	} else if (salvageContext && isForcedToolChoice(salvageContext.toolChoice)) {
		// Forced tool call that streamed/returned as text content — recover it.
		const knownToolNames = getToolNames(salvageContext.tools);
		const text = processText(responseObj);
		const salvaged =
			knownToolNames.size > 0 && text ? parseLeakedToolCalls(text, knownToolNames) : [];
		if (salvaged.length > 0) {
			finishReason = "tool_calls";
			message.content = "";
			message.tool_calls = salvaged.map((call) => ({
				id: crypto.randomUUID(),
				type: "function",
				function: { name: call.toolName, arguments: call.input },
			}));
			if (!warnedSalvage) {
				warnedSalvage = true;
				console.warn(
					`[tanstack-ai] Recovered ${salvaged.length} forced tool call(s) that the model returned as text content instead of structured tool calls.`,
				);
			}
		}
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
}

/**
 * Build the Workers AI `inputs` object from an OpenAI-shaped request body.
 */
function buildBindingInputs(body: Record<string, unknown>): Record<string, unknown> {
	const stream = body.stream as boolean | undefined;
	const inputs: Record<string, unknown> = {};
	if (body.messages) {
		inputs.messages = normalizeMessagesForBinding(body.messages as Record<string, unknown>[]);
	}
	if (body.tools) inputs.tools = body.tools;
	if (typeof body.temperature === "number") inputs.temperature = body.temperature;
	if (typeof body.max_tokens === "number") inputs.max_tokens = body.max_tokens;
	if (body.response_format) inputs.response_format = body.response_format;
	if (stream) inputs.stream = true;

	// Workers AI-specific reasoning controls. These belong on the INPUTS object
	// passed to binding.run(model, inputs), not on the options (3rd) arg.
	// See https://github.com/cloudflare/ai/issues/503.
	//
	// `reasoning_effort: null` is a valid value (disables reasoning on models
	// that support it), so we check `!== undefined` rather than truthiness.
	if (body.reasoning_effort !== undefined) {
		inputs.reasoning_effort = body.reasoning_effort;
	}
	if (body.chat_template_kwargs !== undefined) {
		inputs.chat_template_kwargs = body.chat_template_kwargs;
	}
	return inputs;
}

/**
 * True when a model id is a `"<vendor>/<model>"` third-party AI Gateway catalog
 * slug (e.g. `deepseek/deepseek-v4-pro`) rather than a `@cf/*` Workers AI model
 * or a `dynamic/*` route. These are billed through unified billing and MUST run
 * through an AI Gateway, so `env.AI.run` needs a gateway for them.
 */
function isCatalogSlug(model: unknown): model is string {
	return (
		typeof model === "string" &&
		!model.startsWith("@") &&
		!model.startsWith("dynamic/") &&
		model.includes("/")
	);
}

/**
 * Creates a fetch function that intercepts OpenAI SDK requests and translates them
 * to Workers AI binding calls (env.AI.run). This allows the WorkersAiTextAdapter
 * to use the OpenAI SDK against a plain Workers AI binding.
 *
 * Two transports:
 *   - **Plain binding** (default): `binding.run(model, inputs)` — no run-id, not
 *     resumable. Used for `@cf/*` models with no gateway configured.
 *   - **Run path** (when `options.gateway` is set, OR the model is a third-party
 *     `"<provider>/<model>"` catalog slug): `binding.run(model, inputs,
 *     { gateway, returnRawResponse })`. Third-party unified-billing models must
 *     route through a gateway, so a catalog slug with no configured gateway
 *     falls back to the account `"default"` gateway. Resume (`cf-aig-run-id`
 *     wrapping) only engages when a gateway was explicitly configured — the
 *     catalog auto-default is a routing concern, not a resume opt-in.
 *
 * NOTE: The `input` URL parameter is intentionally ignored. The model name and all
 * request parameters are extracted from the JSON body, matching Workers AI's
 * `binding.run(model, inputs)` calling convention.
 */
export function createWorkersAiBindingFetch(
	binding: WorkersAiBinding,
	options?: WorkersAiBindingFetchOptions,
): typeof fetch {
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
		const inputs = buildBindingInputs(body);

		// A third-party catalog slug needs a gateway even when none was configured
		// (unified billing routes through one) — default it to the account gateway.
		// An explicitly configured gateway always wins and is the only case that
		// opts into resume.
		const explicitGateway = options?.gateway;
		const effectiveGateway = explicitGateway ?? (isCatalogSlug(model) ? "default" : undefined);
		const resumeEnabled = !!explicitGateway && options?.resume !== false;

		// Context for the gpt-oss forced-tool-call salvage on the non-streaming
		// (graceful-degradation) paths. See cloudflare/ai#560.
		const salvageContext: SalvageContext = {
			tools: body.tools as Array<{ function: { name?: string } }> | undefined,
			toolChoice: body.tool_choice,
		};

		const signal = init?.signal ?? undefined;
		const sseResponse = (transformed: ReadableStream<Uint8Array>): Response =>
			new Response(transformed, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
				},
			});

		// --- Run path (gateway set or catalog slug): surfaces cf-aig-run-id ---
		if (effectiveGateway) {
			const runOptions: Record<string, unknown> = {
				gateway: { id: effectiveGateway },
				returnRawResponse: true,
			};
			if (options?.extraHeaders) runOptions.extraHeaders = options.extraHeaders;
			if (signal) runOptions.signal = signal;

			let raw: Response;
			try {
				raw = (await binding.run(model, inputs, runOptions)) as Response;
			} catch (error) {
				return bindingErrorToResponse(error);
			}

			// A non-OK response is an error, never a valid stream. Return it as-is so
			// the OpenAI SDK sees the status (and any `Retry-After`) and retries
			// 4xx/5xx appropriately, instead of us swallowing it via `raw.json()`
			// into an empty "successful" completion.
			if (!raw.ok) return raw;

			const runId = raw.headers?.get?.("cf-aig-run-id") ?? null;
			const contentType = raw.headers?.get?.("content-type") ?? "";
			const isStreamResponse =
				stream && !!raw.body && contentType.includes("text/event-stream");

			if (isStreamResponse) {
				let byteStream = raw.body as ReadableStream<Uint8Array>;
				if (resumeEnabled && runId) {
					// Wrap the RAW run-path bytes with the resume engine BEFORE the
					// SSE transform, so the engine's event-offset bookkeeping (it
					// counts `\n\n` on the raw stream) stays correct.
					byteStream = createResumableStream({
						binding: binding as unknown as Ai,
						gateway: effectiveGateway,
						runId,
						initial: byteStream,
						onResumeExpired: options?.onResumeExpired,
						signal,
					});
				} else if (options?.resume && !runId) {
					if (!warnedNoRunId) {
						warnedNoRunId = true;
						console.warn(
							"[tanstack-ai] resume was requested but no `cf-aig-run-id` was returned " +
								"(the model/gateway path may not support resume yet); proceeding without resume.",
						);
					}
				}
				return sseResponse(transformWorkersAiStream(byteStream, model));
			}

			// Graceful degradation: a streaming request returned a non-SSE body
			// (some models return a complete response even with `stream: true`),
			// or this was a non-streaming request. Parse and wrap as OpenAI.
			const json = await raw.json().catch(() => ({}));
			return wrapWorkersAiResultAsOpenAI(json, model, salvageContext);
		}

		// --- Plain binding path (default): not resumable ---
		const runOptions: Record<string, unknown> = {};
		if (options?.extraHeaders) runOptions.extraHeaders = options.extraHeaders;
		if (signal) runOptions.signal = signal;

		let result: unknown;
		try {
			result = await binding.run(
				model,
				inputs,
				Object.keys(runOptions).length > 0 ? runOptions : undefined,
			);
		} catch (error) {
			// Surface binding failures as HTTP responses so the OpenAI SDK's
			// status-based retry engages (e.g. 3040 "out of capacity" → 429).
			return bindingErrorToResponse(error);
		}

		if (stream && result instanceof ReadableStream) {
			// Workers AI returns an SSE stream with `data: {"response":"chunk"}` format.
			// Transform it to OpenAI-compatible SSE format.
			return sseResponse(
				transformWorkersAiStream(result as ReadableStream<Uint8Array>, model),
			);
		}

		// Graceful degradation: some models return a complete (non-streaming)
		// response even when `stream: true` is requested. Fall through to the
		// non-streaming wrapper which produces a valid OpenAI Chat Completion
		// response that the SDK can consume.
		return wrapWorkersAiResultAsOpenAI(result, model, salvageContext);
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
	const encoder = new TextEncoder();
	// Generate a stable ID and timestamp for the entire stream, matching OpenAI's
	// convention where all chunks in a single response share the same id/created.
	const streamId = `workers-ai-${crypto.randomUUID()}`;
	const created = Math.floor(Date.now() / 1000);
	let hasToolCalls = false;
	// When true, the source stream is already in OpenAI format (some models
	// like Qwen3, Kimi K2.5 stream OpenAI-compatible SSE through the binding).
	// In that case, flush() should only emit [DONE] and skip the finish chunk.
	let isOpenAiFormat = false;
	// Track tool call state per index: store the generated/assigned ID so that
	// subsequent argument deltas use the same ID (matching the working streaming.ts pattern).
	const toolCallState = new Map<number, { id: string; name: string }>();

	// Decode raw bytes into SSE `data:` payloads with the shared gateway-core
	// decoder, then re-emit OpenAI-compatible SSE chunks.
	return source.pipeThrough(new SSEDecoder()).pipeThrough(
		new TransformStream<string, Uint8Array>({
			transform(data, controller) {
				// Swallow source [DONE]; we emit our own in flush()
				if (!data || data === "[DONE]") return;

				try {
					const parsed = JSON.parse(data);

					// Some models (Qwen3, Kimi K2.5) return OpenAI-compatible format
					// directly through the binding, with `choices[].delta.content` and
					// optional `reasoning_content`. Detect this and pass through as-is.
					if (parsed.choices !== undefined) {
						// Already OpenAI format — pass through but ensure each tool call
						// index gets a unique, stable ID across all chunks.
						isOpenAiFormat = true;
						const choice = parsed.choices?.[0];
						if (choice?.delta?.tool_calls) {
							hasToolCalls = true;
							for (const tc of choice.delta.tool_calls) {
								const tcIndex = tc.index ?? 0;
								if (!toolCallState.has(tcIndex)) {
									// First chunk for this index — generate/store unique ID
									const id = tc.id || `call${streamId}${tcIndex}`;
									toolCallState.set(tcIndex, {
										id,
										name: tc.function?.name || "",
									});
									tc.id = id;
								} else {
									// Subsequent chunk — reuse stored ID, remove id from delta
									// (OpenAI format only sends id in first chunk)
									delete tc.id;
								}
							}
						}
						if (choice?.finish_reason === "tool_calls") {
							hasToolCalls = true;
						}
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
						return;
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

							if (!toolCallState.has(tcIndex)) {
								// First chunk for this tool call index — emit id, type, name.
								const id = tcId || `call${streamId}${tcIndex}`;
								toolCallState.set(tcIndex, { id, name: tcName || "" });
								toolCallDelta.id = id;
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
