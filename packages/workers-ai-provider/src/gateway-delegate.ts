import type { LanguageModelV4, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import {
	asText,
	buildGatewayEntry,
	createResumableStream,
	GatewayDelegateError,
	type GatewayCacheOptions,
	type GatewayEntry,
	type ResumeExpiredPolicy,
} from "@cloudflare/gateway-core";
import { createClientFallbackModel } from "./client-fallback";
import { findProviderBySlug, type GatewayProviderInfo, type WireFormat } from "./gateway-providers";

export {
	createResumableStream,
	GatewayDelegateError,
	type GatewayDelegateErrorKind,
	type ResumableStreamOptions,
	type ResumeExpiredPolicy,
} from "@cloudflare/gateway-core";
export {
	type FallbackAttempt,
	type GatewayErrorCode,
	type GatewayErrorContext,
	WorkersAIFallbackError,
	WorkersAIGatewayError,
} from "./errors";
export { type FallbackLeg, createClientFallbackModel } from "./client-fallback";
export {
	type Billing,
	GATEWAY_PROVIDERS,
	type GatewayProviderInfo,
	type WireFormat,
	detectProviderByUrl,
	findProviderBySlug,
	wireableProviders,
} from "./gateway-providers";

/**
 * Gateway delegate — route AI SDK catalog models through Cloudflare AI Gateway,
 * with capability-driven transport selection.
 *
 * Two transports back the same model, chosen from the requested options:
 *
 *   - **Run path** `env.AI.run(slug, body, { returnRawResponse })` — resumable
 *     streaming (`cf-aig-run-id`). The default.
 *   - **Gateway path** `env.AI.gateway(id).run([entry, …fallback])` — server-side
 *     fallback and caching. Does not surface `cf-aig-run-id`, so resume is off.
 *
 * The SAME `@ai-sdk/*` provider parses the response on either path, so there is no
 * per-provider or per-path response parsing here. Provider plugins (which import
 * `@ai-sdk/openai`, `@ai-sdk/anthropic`, …) are injected from sub-path modules
 * (`workers-ai-provider/openai`, …) so those AI SDK packages stay OPTIONAL peer
 * dependencies — you only install the ones you use.
 *
 * @example
 * ```ts
 * import { createGatewayDelegate } from "workers-ai-provider/gateway-delegate";
 * import { openai } from "workers-ai-provider/openai";
 * import { streamText } from "ai";
 *
 * const wai = createGatewayDelegate({
 *   binding: env.AI,
 *   gateway: "my-gateway",
 *   providers: [openai],
 * });
 *
 * const result = streamText({ model: wai("openai/gpt-5"), prompt: "Hello" });
 * // result.response.headers["cf-aig-run-id"] is set — resume from there.
 * ```
 */

// ---------------------------------------------------------------------------
// Slug parsing
// ---------------------------------------------------------------------------

export interface ParsedSlug {
	/** First path segment — the registry resolver key (selects provider + wire format). */
	resolverKey: string;
	/** Remaining segments — the provider-native model id. */
	modelId: string;
}

/**
 * Parse a `vendor/model` slug. The first segment is the resolver key (which
 * registry entry handles it); the rest is the provider-native model id. Routing
 * providers keep multi-segment model ids, e.g. `openrouter/anthropic/claude`.
 */
export function parseSlug(slug: string): ParsedSlug {
	const slash = slug.indexOf("/");
	if (slash === -1) {
		throw new GatewayDelegateError(
			"config",
			`Model slug "${slug}" has no resolver key. Use "<provider>/<model>" (e.g. "openai/gpt-5").`,
		);
	}
	const resolverKey = slug.slice(0, slash);
	const modelId = slug.slice(slash + 1);
	if (!resolverKey || !modelId) {
		throw new GatewayDelegateError(
			"config",
			`Model slug "${slug}" is malformed. Use "<provider>/<model>" (e.g. "openai/gpt-5").`,
		);
	}
	return { resolverKey, modelId };
}

/**
 * Resolve a slug to its registry entry, raising a helpful error for unknown or
 * bring-your-own-provider-only providers.
 */
export function resolveProvider(slug: string, parsed: ParsedSlug): GatewayProviderInfo {
	const info = findProviderBySlug(parsed.resolverKey);
	if (!info) {
		throw new GatewayDelegateError(
			"config",
			`Unknown gateway provider "${parsed.resolverKey}" (from slug "${slug}"). ` +
				"See the AI Gateway provider directory for valid slugs, or use " +
				"createGatewayProvider to bring your own @ai-sdk provider.",
		);
	}
	if (!info.wireFormat) {
		throw new GatewayDelegateError(
			"config",
			`Provider "${parsed.resolverKey}" is not chat/completions-shaped and has no built-in ` +
				"parser. Reach it with createGatewayProvider (bring your own @ai-sdk provider).",
		);
	}
	return info;
}

// ---------------------------------------------------------------------------
// Provider plugins (injected from sub-path modules)
// ---------------------------------------------------------------------------

/**
 * Adapts a `@ai-sdk/*` provider to the delegate, keyed by the response wire
 * format it parses. Imported from a sub-path module (e.g.
 * `workers-ai-provider/openai`) so the AI SDK package stays an optional peer
 * dependency. One plugin serves every registry provider of that wire format —
 * the `openai` plugin covers the whole OpenAI-compatible long tail (deepseek,
 * grok, groq, mistral, perplexity, openrouter, …).
 */
export interface ProviderPlugin {
	/** The response wire format this builder parses. */
	readonly wireFormat: WireFormat;
	/**
	 * Build the AI SDK model, wiring the gateway-dispatching `fetch`. `baseURL`
	 * (when provided by the registry) targets the provider's host so the request
	 * URL host-strips to its gateway-native endpoint — pass it to the underlying
	 * `@ai-sdk` provider.
	 */
	create(args: {
		modelId: string;
		fetch: typeof globalThis.fetch;
		baseURL?: string;
	}): LanguageModelV4;
}

// ---------------------------------------------------------------------------
// Options + transport selection
// ---------------------------------------------------------------------------

export type Transport = "run" | "gateway";

export interface FallbackOptions {
	/** `"client"` keeps resume (sequential run-path attempts); `"server"` uses the gateway path. */
	mode: "client" | "server";
	/** Ordered model slugs to try after the primary. */
	models: string[];
}

export interface DispatchInfo {
	transport: Transport;
	resumeEnabled: boolean;
	warnings: string[];
	runId: string | null;
	status: number | null;
	cfStep: string | null;
	cacheStatus: string | null;
	logId: string | null;
}

export interface DelegateCallOptions {
	/** Resumable streaming (run path). Defaults to the delegate's `resume` (true). */
	resume?: boolean;
	/** Cross-model fallback. `"server"` mode uses the gateway path (disables resume). */
	fallback?: FallbackOptions;
	/** Gateway-path response caching (seconds). Forces the gateway path. */
	cacheTtl?: number;
	/** Bypass gateway cache. Forces the gateway path. */
	skipCache?: boolean;
	/** Escape hatch: force a transport. */
	transport?: Transport;
	/**
	 * Run path only: behavior when the resume buffer has expired (404) after a
	 * mid-stream drop. `"error"` (default) surfaces a `GatewayDelegateError`;
	 * `"accept-partial"` ends the stream cleanly with whatever was delivered.
	 */
	onResumeExpired?: ResumeExpiredPolicy;
	/** Extra request headers (run path: `extraHeaders`; gateway path: entry headers). */
	extraHeaders?: Record<string, string>;
	/**
	 * Gateway path only: forward the upstream provider key instead of stripping it.
	 * Required for BYOK providers (not on unified billing). Supply the key via
	 * `extraHeaders` (e.g. `{ authorization: "Bearer …" }`); without `byok` the
	 * delegate strips provider auth headers so unified billing applies.
	 */
	byok?: boolean;
	/**
	 * Gateway path only: BYOK stored-key alias to authenticate with
	 * (`cf-aig-byok-alias`). Selects a non-`default` key you configured for the
	 * provider on the gateway. Independent of `byok` (which controls whether the
	 * caller's own provider auth header is forwarded vs. stripped).
	 */
	byokAlias?: string;
	/**
	 * Per-request Zero Data Retention override (`cf-aig-zdr`), Unified Billing
	 * only: `true` forces ZDR-capable upstreams, `false` disables it for this
	 * request. Overrides the gateway-level ZDR default. Applied on both transports
	 * (run path: passed through gateway options as a header; gateway path: entry header).
	 */
	zdr?: boolean;
	/** Override the delegate's gateway for this model. */
	gateway?: GatewayOptions | string;
	/**
	 * Custom metadata attached to the gateway log for this request (spend
	 * attribution, tenant ids, etc.). Merges over any `metadata` already set via
	 * `gateway: { metadata }`. Applied on both transports (run path: gateway
	 * options; gateway path: `cf-aig-metadata` header). `bigint` values are
	 * coerced to strings for the header form.
	 */
	metadata?: Record<string, number | string | boolean | null | bigint>;
	/** Force gateway log collection on/off for this request (both transports). */
	collectLog?: boolean;
	/** Called once per dispatch with the resolved transport + gateway headers. */
	onDispatch?: (info: DispatchInfo) => void;
	/**
	 * Run path only: fired with the cumulative SSE event offset as the resumable
	 * stream advances. Pair with `onDispatch` (for `runId`) to persist
	 * `{ runId, eventOffset }` for cross-invocation re-attach after eviction.
	 * Throttle your own writes — this can fire per chunk.
	 */
	onProgress?: (eventOffset: number) => void;
}

interface Selection {
	transport: Transport;
	resumeEnabled: boolean;
	warnings: string[];
}

/**
 * Resolve the transport from the requested options. Gateway-only features (server
 * fallback, caching) force the gateway path and disable resume — with a loud
 * warning if resume was merely defaulted, or a thrown error if it was explicitly
 * requested.
 */
export function selectTransport(
	opts: DelegateCallOptions,
	resumeExplicitlyTrue: boolean,
	runCatalog = true,
	gatewayAvailable = true,
): Selection {
	const warnings: string[] = [];
	const wantsServerFallback = opts.fallback?.mode === "server";
	const wantsCaching = opts.cacheTtl !== undefined || opts.skipCache === true;
	const gatewayOnly = wantsServerFallback || wantsCaching;
	const feature = wantsServerFallback ? 'fallback.mode:"server"' : "caching (cacheTtl/skipCache)";

	// Run-path-only providers (on the run catalog, but not native gateway
	// providers) have no gateway path at all — reject anything that would need it
	// here, with a clear message, rather than letting it fail upstream.
	if (
		runCatalog &&
		!gatewayAvailable &&
		(opts.transport === "gateway" || opts.byok || gatewayOnly)
	) {
		const what =
			opts.transport === "gateway" ? 'transport:"gateway"' : opts.byok ? "byok" : feature;
		throw new GatewayDelegateError(
			"config",
			`${what} is unavailable: this provider is on the unified run catalog but is not a ` +
				"native gateway provider, so it has no gateway path (no caching, server-side " +
				'fallback, BYOK, or transport:"gateway"). Use the default run path, or fallback.mode:"client".',
		);
	}

	// BYOK providers are not on the resumable run catalog — they can only be
	// reached through the gateway path.
	if (!runCatalog) {
		if (opts.transport === "run") {
			throw new GatewayDelegateError(
				"config",
				'transport:"run" is unavailable: this provider is not on the unified-billing run ' +
					"catalog, so it can only be reached through the gateway path (BYOK).",
			);
		}
		if (resumeExplicitlyTrue) {
			throw new GatewayDelegateError(
				"config",
				"resume:true is unavailable: this provider is not on the resumable run catalog " +
					"(cf-aig-run-id requires the unified-billing run path).",
			);
		}
		return { transport: "gateway", resumeEnabled: false, warnings };
	}

	// BYOK forwards the caller's own provider key, which only the gateway path
	// supports — treat it like an explicit gateway transport (no resume-disabled
	// warning; the caller opted into a gateway-only mode).
	if (opts.byok) {
		if (opts.transport === "run") {
			throw new GatewayDelegateError(
				"config",
				'transport:"run" cannot forward a BYOK key — BYOK is a gateway-path feature. ' +
					'Drop transport:"run" (or set transport:"gateway").',
			);
		}
		if (resumeExplicitlyTrue) {
			throw new GatewayDelegateError(
				"config",
				"byok cannot provide resume — cf-aig-run-id is only on the unified-billing run path.",
			);
		}
		return { transport: "gateway", resumeEnabled: false, warnings };
	}

	if (opts.transport === "run" && gatewayOnly) {
		throw new GatewayDelegateError(
			"config",
			`transport:"run" cannot satisfy ${feature}: those features are only available on the ` +
				'gateway path. Use the gateway transport, or fallback.mode:"client".',
		);
	}
	if (opts.transport === "gateway" && resumeExplicitlyTrue) {
		throw new GatewayDelegateError(
			"config",
			'transport:"gateway" cannot provide resume — cf-aig-run-id is only on the run path.',
		);
	}

	if (gatewayOnly) {
		if (resumeExplicitlyTrue) {
			throw new GatewayDelegateError(
				"config",
				`resume:true conflicts with ${feature}: resume (cf-aig-run-id) is only on the run path, ` +
					`which does not support ${wantsServerFallback ? "server-side fallback" : "caching"}. ` +
					'Use fallback.mode:"client" to keep resume, or drop resume.',
			);
		}
		warnings.push(
			`[workers-ai-provider] resume disabled: ${feature} requires the gateway path, which does ` +
				'not surface cf-aig-run-id. Use fallback.mode:"client" to keep resumable streaming.',
		);
		return { transport: "gateway", resumeEnabled: false, warnings };
	}

	const transport = opts.transport ?? "run";
	return {
		transport,
		resumeEnabled: transport === "run" && opts.resume !== false,
		warnings,
	};
}

// ---------------------------------------------------------------------------
// Dispatch internals
// ---------------------------------------------------------------------------

interface AiGatewayRunner {
	run(body: unknown, options?: Record<string, unknown>): Promise<Response>;
}

function normalizeGateway(gateway: GatewayOptions | string | undefined): {
	id: string;
	options: GatewayOptions;
} {
	if (!gateway) {
		throw new GatewayDelegateError(
			"config",
			"A gateway is required for the delegate (resume needs a gateway). " +
				'Pass `gateway: "<gateway-id>"` to createGatewayDelegate or per call.',
		);
	}
	if (typeof gateway === "string") return { id: gateway, options: { id: gateway } };
	return { id: gateway.id, options: gateway };
}

export interface GatewayDelegateConfig {
	/** A Cloudflare AI binding (e.g. `env.AI`). Required — the gateway path needs `binding.gateway()`. */
	binding: Ai;
	/** Default gateway id (or options) for all models. Overridable per call. */
	gateway?: GatewayOptions | string;
	/** Provider plugins from sub-path modules (e.g. `[openai, anthropic]`). */
	providers: ProviderPlugin[];
	/** Default resume behavior when a call does not specify one. Defaults to `true`. */
	resume?: boolean;
	/** Default resume-expiry policy (run path). Defaults to `"error"`. */
	onResumeExpired?: ResumeExpiredPolicy;
}

export interface GatewayDelegate {
	(slug: string, options?: DelegateCallOptions): LanguageModelV4;
}

/**
 * Create a gateway delegate. Returns a function that builds an AI SDK model for a
 * `"<provider>/<model>"` slug, dispatched through AI Gateway on the transport the
 * requested options imply.
 */
export function createGatewayDelegate(config: GatewayDelegateConfig): GatewayDelegate {
	if (!config?.binding) {
		throw new GatewayDelegateError(
			"config",
			"createGatewayDelegate requires a `binding` (e.g. { binding: env.AI }).",
		);
	}
	if (!config.providers?.length) {
		throw new GatewayDelegateError(
			"config",
			"createGatewayDelegate requires at least one provider plugin, e.g. " +
				'`providers: [openai]` from "workers-ai-provider/openai".',
		);
	}

	const plugins = new Map<WireFormat, ProviderPlugin>();
	for (const p of config.providers) plugins.set(p.wireFormat, p);
	const defaultResume = config.resume ?? true;

	const buildOne = (
		slug: string,
		options: DelegateCallOptions,
	): { model: LanguageModelV4; transport: Transport } => {
		const parsed = parseSlug(slug);
		const info = resolveProvider(slug, parsed);

		const resumeExplicitlyTrue = options.resume === true;
		const effectiveOptions: DelegateCallOptions = {
			...options,
			resume: options.resume ?? defaultResume,
			onResumeExpired: options.onResumeExpired ?? config.onResumeExpired,
		};
		const selection = selectTransport(
			effectiveOptions,
			resumeExplicitlyTrue,
			info.runCatalog,
			info.gatewayPath !== false,
		);
		for (const w of selection.warnings) console.warn(w);

		// Pick the parser by transport. The unified-billing run path (`env.AI.run`)
		// does NOT speak a uniform wire format: Cloudflare normalizes most providers
		// to OpenAI chat-completions (so `google` is parsed with the `openai` plugin
		// on the run path), but passes Anthropic through natively. So the run path
		// uses the registry's `runWireFormat` (default "openai"), while the gateway
		// path — which hits provider-native endpoints — uses the native `wireFormat`.
		const wire: WireFormat =
			selection.transport === "run"
				? (info.runWireFormat ?? "openai")
				: (info.wireFormat as WireFormat);
		const plugin = plugins.get(wire);
		if (!plugin) {
			throw new GatewayDelegateError(
				"config",
				selection.transport === "run"
					? `The run path for "${parsed.resolverKey}" (from slug "${slug}") returns ` +
							`"${wire}"-wire responses, so it needs the "${wire}" plugin. ` +
							`Install + pass it from "workers-ai-provider/${wire}". ` +
							`Registered: ${[...plugins.keys()].join(", ") || "<none>"}.`
					: `No provider plugin for wire format "${wire}" (needed by "${parsed.resolverKey}" ` +
							`on the gateway path from slug "${slug}"). ` +
							`Registered: ${[...plugins.keys()].join(", ") || "<none>"}. ` +
							`Install + pass the matching plugin from "workers-ai-provider/${wire}".`,
			);
		}

		const { id: gatewayId, options: gatewayOptions } = normalizeGateway(
			options.gateway ?? config.gateway,
		);

		const fetchImpl =
			selection.transport === "run"
				? makeRunFetch(
						config.binding,
						// Use the canonical run-catalog author (e.g. "grok" → "xai"), not the
						// raw alias the caller typed, so `env.AI.run` resolves the model.
						`${info.resolverKey}/${parsed.modelId}`,
						gatewayOptions,
						effectiveOptions,
						selection,
						options,
					)
				: makeGatewayFetch(
						config.binding,
						info,
						gatewayId,
						gatewayOptions,
						effectiveOptions,
						selection,
						options,
					);

		return {
			model: plugin.create({
				modelId: parsed.modelId,
				fetch: fetchImpl,
				// baseURL only matters on the gateway path (host-strip to the native
				// endpoint); the run path ignores the request URL entirely.
				...(selection.transport === "gateway" && info.baseURL
					? { baseURL: info.baseURL }
					: {}),
			}),
			transport: selection.transport,
		};
	};

	return (slug, options = {}) => {
		// Client-side fallback: build a model per slug and wrap them so a failed
		// pre-stream dispatch falls through to the next, each on its own transport
		// (so resume is preserved per leg).
		if (options.fallback?.mode === "client") {
			const { fallback, ...rest } = options;
			const slugs = [slug, ...fallback.models];
			const legs = slugs.map((s) => {
				const { model, transport } = buildOne(s, rest);
				return { slug: s, model, transport };
			});
			return createClientFallbackModel(legs);
		}

		// Server-side fallback: all legs ship in one gateway run; `cf-aig-step`
		// names the winner. Same-vendor legs are handled by makeGatewayFetch (it
		// just swaps `model` in one body); cross-vendor legs need each leg's own
		// builder to shape its native request, so route them through the
		// capture/redispatch engine (ported from ai-gateway-provider).
		if (options.fallback?.mode === "server") {
			const slugs = [slug, ...options.fallback.models];
			const resolved = slugs.map((s) => {
				const parsed = parseSlug(s);
				return { slug: s, modelId: parsed.modelId, info: resolveProvider(s, parsed) };
			});
			const crossVendor = resolved.some(
				(r) => r.info.gatewayProviderId !== resolved[0]!.info.gatewayProviderId,
			);
			if (crossVendor) {
				const resumeExplicitlyTrue = options.resume === true;
				const effectiveOptions: DelegateCallOptions = {
					...options,
					resume: options.resume ?? defaultResume,
					onResumeExpired: options.onResumeExpired ?? config.onResumeExpired,
				};
				const primaryInfo = resolved[0]!.info;
				// Forces the gateway path + disables resume (throws if resume:true).
				const selection = selectTransport(
					effectiveOptions,
					resumeExplicitlyTrue,
					primaryInfo.runCatalog,
					primaryInfo.gatewayPath !== false,
				);
				for (const w of selection.warnings) console.warn(w);

				const { id: gatewayId, options: gatewayOptions } = normalizeGateway(
					options.gateway ?? config.gateway,
				);

				const legs: ServerFallbackLeg[] = resolved.map((r) => {
					if (r.info.gatewayPath === false) {
						throw new GatewayDelegateError(
							"config",
							`Server-side fallback cannot use "${r.slug}": it is on the unified ` +
								"run catalog but has no native gateway path.",
						);
					}
					const wire = r.info.wireFormat as WireFormat;
					const plugin = plugins.get(wire);
					if (!plugin) {
						throw new GatewayDelegateError(
							"config",
							`No provider plugin for wire format "${wire}" (needed by "${r.slug}" ` +
								`for server-side fallback). Registered: ` +
								`${[...plugins.keys()].join(", ") || "<none>"}.`,
						);
					}
					return { slug: r.slug, modelId: r.modelId, info: r.info, plugin };
				});

				return makeServerFallbackModel({
					binding: config.binding,
					gatewayId,
					gatewayOptions,
					legs,
					opts: effectiveOptions,
					selection,
					callOptions: options,
				});
			}
		}

		return buildOne(slug, options).model;
	};
}

function fireDispatch(resp: Response, selection: Selection, options: DelegateCallOptions): void {
	if (!options.onDispatch) return;
	options.onDispatch({
		transport: selection.transport,
		resumeEnabled: selection.resumeEnabled,
		warnings: selection.warnings,
		status: resp.status,
		runId: resp.headers.get("cf-aig-run-id"),
		cfStep: resp.headers.get("cf-aig-step"),
		cacheStatus: resp.headers.get("cf-aig-cache-status"),
		logId: resp.headers.get("cf-aig-log-id"),
	});
}

type GatewayMetadata = Record<string, number | string | boolean | null | bigint>;

/** Merge call-level metadata over gateway-option metadata (call wins). */
function mergeMetadata(
	base: GatewayMetadata | undefined,
	override: GatewayMetadata | undefined,
): GatewayMetadata | undefined {
	if (!base && !override) return undefined;
	return { ...base, ...override };
}

/**
 * Build the `cf-aig-*` request controls for a gateway-path entry. First-class
 * call options (`cacheTtl`, `skipCache`, `collectLog`, `metadata`, `byokAlias`,
 * `zdr`) are layered over the binding-style gateway options (`cacheKey`,
 * `eventId`, `requestTimeoutMs`, `retries`) so the gateway path reaches parity
 * with the run path, which forwards the whole `GatewayOptions` to `binding.run`.
 */
function buildGatewayControls(
	gatewayOptions: GatewayOptions,
	opts: DelegateCallOptions,
): GatewayCacheOptions {
	const metadata = mergeMetadata(gatewayOptions.metadata, opts.metadata);
	return {
		cacheTtl: opts.cacheTtl,
		skipCache: opts.skipCache,
		...(gatewayOptions.cacheKey !== undefined ? { cacheKey: gatewayOptions.cacheKey } : {}),
		...(metadata ? { metadata } : {}),
		...(opts.collectLog !== undefined ? { collectLog: opts.collectLog } : {}),
		...(gatewayOptions.eventId !== undefined ? { eventId: gatewayOptions.eventId } : {}),
		...(gatewayOptions.requestTimeoutMs !== undefined
			? { requestTimeoutMs: gatewayOptions.requestTimeoutMs }
			: {}),
		...(gatewayOptions.retries ? { retries: gatewayOptions.retries } : {}),
		...(opts.byokAlias !== undefined ? { byokAlias: opts.byokAlias } : {}),
		...(opts.zdr !== undefined ? { zdr: opts.zdr } : {}),
	};
}

function makeRunFetch(
	binding: Ai,
	slug: string,
	gatewayOptions: GatewayOptions,
	opts: DelegateCallOptions,
	selection: Selection,
	callOptions: DelegateCallOptions,
): typeof globalThis.fetch {
	return (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const body = JSON.parse(asText(init?.body)) as Record<string, unknown>;
		// The slug carries the model; drop the redundant body field (both are tolerated).
		delete body.model;

		// Fold first-class metadata/collectLog over anything supplied via
		// `gateway: { ... }`; explicit call options win.
		const mergedGateway: GatewayOptions = { ...gatewayOptions };
		const mergedMeta = mergeMetadata(gatewayOptions.metadata, opts.metadata);
		if (mergedMeta) mergedGateway.metadata = mergedMeta;
		if (opts.collectLog !== undefined) mergedGateway.collectLog = opts.collectLog;

		// `zdr` is a Unified-Billing (run path) feature, but it's not a field on the
		// binding's `GatewayOptions`, so pass it as a `cf-aig-zdr` extra header.
		const extraHeaders: Record<string, string> = { ...opts.extraHeaders };
		if (opts.zdr !== undefined) extraHeaders["cf-aig-zdr"] = String(opts.zdr);

		const runOptions = {
			gateway: mergedGateway,
			returnRawResponse: true,
			...(Object.keys(extraHeaders).length > 0 ? { extraHeaders } : {}),
			...(init?.signal ? { signal: init.signal } : {}),
		};

		// The binding's `run` is heavily overloaded; narrow to the raw-Response
		// streaming signature. Call as a METHOD on the binding — extracting it
		// into a bare variable detaches `this` and the binding throws on a private
		// field access ("Cannot set properties of undefined (setting '#options')").
		const ai = binding as unknown as {
			run(
				model: string,
				inputs: Record<string, unknown>,
				options: Record<string, unknown>,
			): Promise<Response>;
		};
		const resp = await ai.run(slug, body, runOptions);
		fireDispatch(resp, selection, callOptions);

		// Wrap the stream so a transient mid-stream drop reconnects via the gateway
		// resume endpoint transparently — the @ai-sdk parser never sees the break.
		const runId = resp.headers.get("cf-aig-run-id");
		if (selection.resumeEnabled && runId && resp.body) {
			const resumable = createResumableStream({
				binding,
				gateway: gatewayOptions.id,
				runId,
				initial: resp.body,
				onResumeExpired: opts.onResumeExpired,
				...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
			});
			return new Response(resumable, { status: resp.status, headers: resp.headers });
		}
		return resp;
	}) as typeof globalThis.fetch;
}

function makeGatewayFetch(
	binding: Ai,
	info: GatewayProviderInfo,
	gatewayId: string,
	gatewayOptions: GatewayOptions,
	opts: DelegateCallOptions,
	selection: Selection,
	callOptions: DelegateCallOptions,
): typeof globalThis.fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const rawUrl = typeof input === "string" ? input : input.toString();
		// Host-strip to the provider's gateway-native endpoint. The registry
		// transform matches because the builder targeted the provider's baseURL;
		// fall back to a generic pathname strip if it somehow doesn't.
		const endpoint = info.transformEndpoint
			? info.transformEndpoint(rawUrl)
			: new URL(rawUrl).pathname.replace(/^\//, "") + (new URL(rawUrl).search || "");
		const body = JSON.parse(asText(init?.body)) as Record<string, unknown>;

		// Strip the AI SDK's placeholder provider key unless BYOK forwards a real
		// one; unified billing / the gateway's stored key authenticates otherwise.
		const primary: GatewayEntry = buildGatewayEntry({
			providerId: info.gatewayProviderId,
			endpoint,
			initHeaders: init?.headers,
			body,
			...(opts.byok ? {} : { stripAuthHeaders: info.authHeaders }),
			...(opts.extraHeaders ? { extraHeaders: opts.extraHeaders } : {}),
			cache: buildGatewayControls(gatewayOptions, opts),
		});
		const entries: GatewayEntry[] = [primary];

		// Same-vendor server fallback: every leg shares this provider + endpoint, so
		// each is just the primary entry with `model` swapped. (Cross-vendor chains
		// never reach here — the delegate routes them through makeServerFallbackModel,
		// which captures each leg's native request; this stays a defensive guard.)
		if (opts.fallback?.mode === "server") {
			for (const fb of opts.fallback.models) {
				const fbParsed = parseSlug(fb);
				const fbInfo = resolveProvider(fb, fbParsed);
				if (fbInfo.gatewayProviderId !== info.gatewayProviderId) {
					throw new GatewayDelegateError(
						"dispatch",
						`Internal: cross-vendor server fallback (${info.gatewayProviderId} → ` +
							`${fbInfo.gatewayProviderId}) reached the same-vendor gateway fetch. ` +
							"This should have been routed through makeServerFallbackModel.",
					);
				}
				entries.push({ ...primary, query: { ...body, model: fbParsed.modelId } });
			}
		}

		const gw = (binding as unknown as { gateway(id: string): AiGatewayRunner }).gateway(
			gatewayId,
		);
		const runOptions: Record<string, unknown> = {};
		if (init?.signal) runOptions.signal = init.signal;
		const resp = await gw.run(entries, runOptions);
		fireDispatch(resp, selection, callOptions);
		return resp;
	}) as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Cross-vendor server-side fallback (ported from ai-gateway-provider)
// ---------------------------------------------------------------------------

/** Sentinel thrown by the capture fetch to stop a leg before it hits the network. */
class ServerFallbackCaptureStop extends Error {}

/** One leg of a server-side fallback chain (gateway path). */
interface ServerFallbackLeg {
	slug: string;
	modelId: string;
	info: GatewayProviderInfo;
	plugin: ProviderPlugin;
}

/**
 * Cross-vendor server-side fallback via the gateway universal endpoint.
 *
 * Unlike same-vendor fallback (which just swaps `model` in one body), legs here
 * are DIFFERENT providers with possibly different wire formats, so each leg's own
 * `@ai-sdk` model must shape its native request. Mirrors ai-gateway-provider's
 * `processModelRequest`: run each leg's builder with a capture `fetch` that
 * sentinel-throws before the network, reshape each captured request into a
 * `{ provider, endpoint, headers, query }` entry, dispatch all N as one
 * `env.AI.gateway(id).run([...])`, then read `cf-aig-step` to find the leg the
 * gateway actually served and feed the raw response back into that leg's model.
 */
function makeServerFallbackModel(params: {
	binding: Ai;
	gatewayId: string;
	gatewayOptions: GatewayOptions;
	legs: ServerFallbackLeg[];
	opts: DelegateCallOptions;
	selection: Selection;
	callOptions: DelegateCallOptions;
}): LanguageModelV4 {
	const { binding, gatewayId, gatewayOptions, legs, opts, selection, callOptions } = params;
	const first = legs[0]!;

	// A throwaway model only used to read static metadata (provider/modelId/urls);
	// its fetch is never invoked for those synchronous reads.
	const refModel = first.plugin.create({
		modelId: first.modelId,
		fetch: (async () => {
			throw new ServerFallbackCaptureStop();
		}) as typeof globalThis.fetch,
		...(first.info.baseURL ? { baseURL: first.info.baseURL } : {}),
	});

	const cache = buildGatewayControls(gatewayOptions, opts);

	const dispatch = async (
		method: "doGenerate" | "doStream",
		options: LanguageModelV4CallOptions,
	): Promise<unknown> => {
		// 1) Capture each leg's native request without hitting the network.
		const entries: GatewayEntry[] = [];
		for (const leg of legs) {
			let captured: { url: string; init?: RequestInit } | undefined;
			const captureFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
				captured = {
					url: typeof input === "string" ? input : input.toString(),
					init,
				};
				throw new ServerFallbackCaptureStop();
			}) as typeof globalThis.fetch;

			const model = leg.plugin.create({
				modelId: leg.modelId,
				fetch: captureFetch,
				...(leg.info.baseURL ? { baseURL: leg.info.baseURL } : {}),
			});
			try {
				await (model[method] as (o: LanguageModelV4CallOptions) => Promise<unknown>)(
					options,
				);
			} catch (e) {
				if (!(e instanceof ServerFallbackCaptureStop)) throw e;
			}
			if (!captured) {
				throw new GatewayDelegateError(
					"dispatch",
					`Server-side fallback leg "${leg.slug}" produced no request to dispatch.`,
				);
			}

			const url = captured.url;
			const endpoint = leg.info.transformEndpoint
				? leg.info.transformEndpoint(url)
				: new URL(url).pathname.replace(/^\//, "") + (new URL(url).search || "");
			const body = JSON.parse(asText(captured.init?.body)) as Record<string, unknown>;

			entries.push(
				buildGatewayEntry({
					providerId: leg.info.gatewayProviderId,
					endpoint,
					initHeaders: captured.init?.headers,
					body,
					...(opts.byok ? {} : { stripAuthHeaders: leg.info.authHeaders }),
					...(opts.extraHeaders ? { extraHeaders: opts.extraHeaders } : {}),
					cache,
				}),
			);
		}

		// 2) One gateway run with all legs; `cf-aig-step` names the winner.
		const gw = (binding as unknown as { gateway(id: string): AiGatewayRunner }).gateway(
			gatewayId,
		);
		const abortSignal = (options as { abortSignal?: AbortSignal }).abortSignal;
		const runOptions: Record<string, unknown> = {};
		if (abortSignal) runOptions.signal = abortSignal;
		const resp = await gw.run(entries, runOptions);
		fireDispatch(resp, selection, callOptions);

		// 3) Feed the raw winner response into its own model so its parser shapes
		//    the result for that leg's wire format.
		const step = Number.parseInt(resp.headers.get("cf-aig-step") ?? "0", 10);
		const winner = legs[step] ?? first;
		const winnerModel = winner.plugin.create({
			modelId: winner.modelId,
			fetch: (async () => resp) as typeof globalThis.fetch,
			...(winner.info.baseURL ? { baseURL: winner.info.baseURL } : {}),
		});
		return (winnerModel[method] as (o: LanguageModelV4CallOptions) => Promise<unknown>)(
			options,
		);
	};

	return {
		specificationVersion: "v4",
		provider: refModel.provider,
		modelId: refModel.modelId,
		supportedUrls: refModel.supportedUrls,
		doGenerate(options) {
			return dispatch("doGenerate", options) as ReturnType<LanguageModelV4["doGenerate"]>;
		},
		doStream(options) {
			return dispatch("doStream", options) as ReturnType<LanguageModelV4["doStream"]>;
		},
	} as LanguageModelV4;
}
