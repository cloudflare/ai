import {
	applyGatewayCacheHeaders,
	createResumableStream,
	type ResumableStreamOptions,
	type ResumeExpiredPolicy,
} from "@cloudflare/gateway-core";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { CF_TEMP_TOKEN } from "./auth";
import { providers } from "./providers";

export class AiGatewayInternalFetchError extends Error {}

export class AiGatewayDoesNotExist extends Error {}

export class AiGatewayUnauthorizedError extends Error {}

async function streamToObject(stream: ReadableStream) {
	const response = new Response(stream);
	return await response.json();
}

/**
 * Read the AI Gateway error code from a failed response without consuming the
 * original body (the response may still be handed to the wrapped model). Returns
 * `undefined` when the body isn't the expected `{ success: false, error: [...] }`
 * shape.
 */
async function readGatewayErrorCode(resp: Response): Promise<number | undefined> {
	let result: {
		success?: boolean;
		error?: { code: number; message: string }[];
	};
	try {
		result = await resp.clone().json();
	} catch {
		return undefined;
	}
	if (result.success === false && result.error && result.error.length > 0) {
		return result.error[0]?.code;
	}
	return undefined;
}

type InternalLanguageModelV3 = LanguageModelV3 & {
	config?: { fetch?: FetchFunction | undefined };
};

export class AiGatewayChatLanguageModel implements LanguageModelV3 {
	readonly specificationVersion = "v3";
	readonly defaultObjectGenerationMode = "json";

	readonly models: InternalLanguageModelV3[];
	readonly config: AiGatewaySettings;

	get supportedUrls(): Record<string, RegExp[]> | PromiseLike<Record<string, RegExp[]>> {
		return this.models[0]?.supportedUrls ?? {};
	}

	get modelId(): string {
		if (!this.models[0]) {
			throw new Error("models cannot be empty array");
		}

		return this.models[0].modelId;
	}

	get provider(): string {
		if (!this.models[0]) {
			throw new Error("models cannot be empty array");
		}

		return this.models[0].provider;
	}

	constructor(models: LanguageModelV3[], config: AiGatewaySettings) {
		this.models = models;
		this.config = config;
	}

	async processModelRequest<
		T extends LanguageModelV3["doStream"] | LanguageModelV3["doGenerate"],
	>(
		options: Parameters<T>[0],
		modelMethod: "doStream" | "doGenerate",
	): Promise<Awaited<ReturnType<T>>> {
		const requests: { url: string; request: Request; modelProvider: string }[] = [];

		// Model configuration and request collection
		for (const model of this.models) {
			if (!model.config || !Object.keys(model.config).includes("fetch")) {
				throw new Error(
					`Sorry, but provider "${model.provider}" is currently not supported, please open a issue in the github repo!`,
				);
			}

			model.config.fetch = (url, request) => {
				requests.push({
					modelProvider: model.provider,
					request: request as Request,
					url: url as string,
				});
				throw new AiGatewayInternalFetchError("Stopping provider execution...");
			};

			try {
				await model[modelMethod](options);
			} catch (e) {
				if (!(e instanceof AiGatewayInternalFetchError)) {
					throw e;
				}
			}
		}

		// Process requests
		const body = await Promise.all(
			requests.map(async (req) => {
				let providerConfig: (typeof providers)[number] | null = null;
				for (const provider of providers) {
					if (provider.regex.test(req.url)) {
						providerConfig = provider;
						break;
					}
				}

				if (!providerConfig) {
					throw new Error(
						`Sorry, but provider "${req.modelProvider}" is currently not supported, please open a issue in the github repo!`,
					);
				}

				if (!req.request.body) {
					throw new Error("Ai Gateway provider received an unexpected empty body");
				}

				// For AI Gateway BYOK / unified billing requests
				// delete the fake injected CF_TEMP_TOKEN

				const authHeader = providerConfig.headerKey ?? "authorization";
				const authValue =
					"get" in req.request.headers
						? req.request.headers.get(authHeader)
						: req.request.headers[authHeader];
				if (authValue?.includes(CF_TEMP_TOKEN)) {
					if ("delete" in req.request.headers) {
						req.request.headers.delete(authHeader);
					} else {
						delete req.request.headers[authHeader];
					}
				}

				return {
					endpoint: providerConfig.transformEndpoint(req.url),
					headers: req.request.headers,
					provider: providerConfig.name,
					query: await streamToObject(req.request.body),
				};
			}),
		);

		// Handle response
		const headers = parseAiGatewayOptions(this.config.options ?? {});
		let resp: Response;

		if ("binding" in this.config) {
			const updatedBody = body.map((obj) => ({
				...obj,
				headers: {
					...(obj.headers ?? {}),
					...Object.fromEntries(headers.entries()),
				},
			}));
			resp = await this.config.binding.run(updatedBody, {
				signal: options.abortSignal,
			});
		} else {
			headers.set("Content-Type", "application/json");
			headers.set("cf-aig-authorization", `Bearer ${this.config.apiKey}`);
			resp = await fetch(
				`https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gateway}`,
				{
					body: JSON.stringify(body),
					headers: headers,
					method: "POST",
					signal: options.abortSignal,
				},
			);
		}

		// Error handling: the gateway signals a missing gateway (2001) or failed
		// gateway auth (2009) via a `{ success: false, error: [...] }` body.
		if (resp.status === 400 && (await readGatewayErrorCode(resp)) === 2001) {
			throw new AiGatewayDoesNotExist("This AI gateway does not exist");
		}
		if (resp.status === 401 && (await readGatewayErrorCode(resp)) === 2009) {
			throw new AiGatewayUnauthorizedError(
				"Your AI Gateway has authentication active, but you didn't provide a valid apiKey",
			);
		}

		const step = Number.parseInt(resp.headers.get("cf-aig-step") ?? "0", 10);
		if (!this.models[step]) {
			throw new Error("Unexpected AI Gateway Error");
		}

		// Opt-in resumable streaming (binding/run path only). When `resume` is
		// configured and the streaming response carries a `cf-aig-run-id`, wrap the
		// SSE body so a transient mid-stream drop reconnects to the gateway resume
		// endpoint transparently. No run id (e.g. the REST/API-key path, or a
		// gateway that doesn't surface one) means this is a no-op.
		if (
			modelMethod === "doStream" &&
			"resume" in this.config &&
			this.config.resume &&
			resp.body
		) {
			const runId = resp.headers.get("cf-aig-run-id");
			if (runId) {
				const { binding, gateway, onResumeExpired, maxReconnects } = this.config.resume;
				resp = new Response(
					createResumableStream({
						binding,
						gateway,
						runId,
						initial: resp.body,
						onResumeExpired,
						maxReconnects,
						signal: options.abortSignal,
					}),
					{
						headers: resp.headers,
						status: resp.status,
						statusText: resp.statusText,
					},
				);
			}
		}

		this.models[step].config = {
			...this.models[step].config,
			fetch: (_url, _req) => resp as unknown as Promise<Response>,
		};

		return this.models[step][modelMethod](options) as Promise<Awaited<ReturnType<T>>>;
	}

	async doStream(
		options: Parameters<LanguageModelV3["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doStream"]>>> {
		return this.processModelRequest<LanguageModelV3["doStream"]>(options, "doStream");
	}

	async doGenerate(
		options: Parameters<LanguageModelV3["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doGenerate"]>>> {
		return this.processModelRequest<LanguageModelV3["doGenerate"]>(options, "doGenerate");
	}
}

/**
 * AI Gateway provider for the Vercel AI SDK. Wraps one or more `@ai-sdk/*`
 * language models and routes their requests through Cloudflare's AI Gateway
 * universal endpoint, with cross-vendor server-side fallback (the first model
 * that succeeds wins, selected via `cf-aig-step`).
 */
export interface AiGateway {
	(models: LanguageModelV3 | LanguageModelV3[]): LanguageModelV3;

	chat(models: LanguageModelV3 | LanguageModelV3[]): LanguageModelV3;
}

export type AiGatewayRetries = {
	maxAttempts?: 1 | 2 | 3 | 4 | 5;
	retryDelayMs?: number;
	backoff?: "constant" | "linear" | "exponential";
};

/** @deprecated Misspelling — use {@link AiGatewayRetries} instead. */
export type AiGatewayReties = AiGatewayRetries;

export type AiGatewayOptions = {
	cacheKey?: string;
	cacheTtl?: number;
	skipCache?: boolean;
	metadata?: Record<string, number | string | boolean | null | bigint>;
	collectLog?: boolean;
	eventId?: string;
	requestTimeoutMs?: number;
	retries?: AiGatewayRetries;
	/**
	 * BYOK stored-key alias to authenticate with → `cf-aig-byok-alias`. Selects a
	 * non-`default` key configured for the provider on the gateway.
	 */
	byokAlias?: string;
	/**
	 * Per-request Zero Data Retention override (Unified Billing only) →
	 * `cf-aig-zdr`. `true` forces ZDR-capable upstreams; `false` disables it for
	 * this request.
	 */
	zdr?: boolean;
};
export type AiGatewayAPISettings = {
	gateway: string;
	accountId: string;
	apiKey?: string;
	options?: AiGatewayOptions;
};
/**
 * Opt-in resumable streaming for the binding (run) path. Supply the full
 * Cloudflare AI binding (`env.AI`) plus the gateway id; when a streaming run
 * surfaces a `cf-aig-run-id`, transient mid-stream drops reconnect transparently
 * via the gateway resume endpoint. The reconnect uses `binding.fetch(...)`, so
 * this must be the AI binding itself — not the `env.AI.gateway(<id>)`
 * sub-binding passed as `binding` above.
 */
export type AiGatewayResumeSettings = {
	/** Full Cloudflare AI binding (`env.AI`) used for the resume reconnect fetch. */
	binding: ResumableStreamOptions["binding"];
	/** Gateway id the run was issued under (the `env.AI.gateway(<id>)` name). */
	gateway: string;
	/** What to do when the resume buffer has expired (404). Defaults to `"error"`. */
	onResumeExpired?: ResumeExpiredPolicy;
	/** Max reconnect attempts before giving up. Defaults to 5. */
	maxReconnects?: number;
};

export type AiGatewayBindingSettings = {
	binding: {
		run(data: unknown, options?: { signal?: AbortSignal }): Promise<Response>;
	};
	options?: AiGatewayOptions;
	/**
	 * Opt-in resumable streaming. No-op on the REST/API-key path (which has no
	 * `cf-aig-run-id`). See {@link AiGatewayResumeSettings}.
	 */
	resume?: AiGatewayResumeSettings;
};
export type AiGatewaySettings = AiGatewayAPISettings | AiGatewayBindingSettings;

export function createAiGateway(options: AiGatewaySettings): AiGateway {
	const createChatModel = (models: LanguageModelV3 | LanguageModelV3[]) => {
		return new AiGatewayChatLanguageModel(Array.isArray(models) ? models : [models], options);
	};

	const provider = (models: LanguageModelV3 | LanguageModelV3[]) => createChatModel(models);

	provider.chat = createChatModel;

	return provider;
}

/**
 * Translate {@link AiGatewayOptions} into the `cf-aig-*` request headers the AI
 * Gateway universal endpoint understands. Delegates to the shared
 * `@cloudflare/gateway-core` header builder so the header names and semantics
 * stay identical to the `workers-ai-provider` delegate (e.g. the current
 * `cf-aig-cache-ttl` / `cf-aig-skip-cache` names rather than the deprecated
 * `cf-cache-ttl` / `cf-skip-cache`).
 */
export function parseAiGatewayOptions(options: AiGatewayOptions): Headers {
	const record: Record<string, string> = {};
	applyGatewayCacheHeaders(record, options);
	return new Headers(record);
}
