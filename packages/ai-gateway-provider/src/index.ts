import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { providers as providerRegistry } from "./providers";

class AiGatewayInternalFetchError extends Error {}

export class AiGatewayDoesNotExist extends Error {}

export class AiGatewayUnauthorizedError extends Error {}

async function parseBody(body: BodyInit): Promise<unknown> {
	return new Response(body).json();
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
	if (!headers) return {};
	if (headers instanceof Headers) {
		return Object.fromEntries(headers.entries());
	}
	if (Array.isArray(headers)) {
		return Object.fromEntries(headers);
	}
	return headers as Record<string, string>;
}

export function resolveProvider(
	url: string,
	explicitName?: string,
): { name: string; endpoint: string } {
	let registryMatch = null;
	for (const p of providerRegistry) {
		if (p.regex.test(url)) {
			registryMatch = p;
		}
	}

	if (registryMatch) {
		return {
			name: explicitName ?? registryMatch.name,
			endpoint: registryMatch.transformEndpoint(url),
		};
	}

	if (explicitName) {
		const parsed = new URL(url);
		return {
			name: explicitName,
			endpoint: parsed.pathname.slice(1) + parsed.search,
		};
	}

	throw new Error(
		`URL "${url}" did not match any known provider. Set providerName to use a custom base URL.`,
	);
}

type InternalLanguageModelV3 = LanguageModelV3 & {
	config?: { fetch?: FetchFunction | undefined };
};

export type AiGatewayRetries = {
	maxAttempts?: 1 | 2 | 3 | 4 | 5;
	retryDelayMs?: number;
	backoff?: "constant" | "linear" | "exponential";
};

export type AiGatewayOptions = {
	cacheKey?: string;
	cacheTtl?: number;
	skipCache?: boolean;
	metadata?: Record<string, number | string | boolean | null | bigint>;
	collectLog?: boolean;
	eventId?: string;
	requestTimeoutMs?: number;
	retries?: AiGatewayRetries;
	byokAlias?: string;
	zdr?: boolean;
};

export type AiGatewayAPIConfig = {
	gateway: string;
	accountId: string;
	apiKey?: string;
	options?: AiGatewayOptions;
};

export type AiGatewayBindingConfig = {
	binding: {
		run(data: unknown): Promise<Response>;
	};
	options?: AiGatewayOptions;
};

export type AiGatewayConfig = AiGatewayAPIConfig | AiGatewayBindingConfig;

// ─── Shared helpers ──────────────────────────────────────────────

type CapturedRequest = {
	url: string;
	headers: Record<string, string>;
	body: unknown;
	originalFetch: FetchFunction | undefined;
};

async function captureModelRequest(
	model: InternalLanguageModelV3,
	options: Parameters<LanguageModelV3["doGenerate"]>[0],
	method: "doStream" | "doGenerate",
): Promise<CapturedRequest> {
	if (!model.config || !Object.keys(model.config).includes("fetch")) {
		throw new Error(
			`Provider "${model.provider}" is not supported — it does not expose a configurable fetch`,
		);
	}

	const originalFetch = model.config.fetch;
	let captured: Omit<CapturedRequest, "originalFetch"> | undefined;

	model.config.fetch = async (input, init) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: (input as Request).url;
		captured = {
			url,
			headers: normalizeHeaders(init?.headers),
			body: init?.body ? await parseBody(init.body as BodyInit) : {},
		};
		throw new AiGatewayInternalFetchError();
	};

	try {
		await model[method](options);
	} catch (e) {
		if (!(e instanceof AiGatewayInternalFetchError)) throw e;
	}

	if (!captured) {
		model.config.fetch = originalFetch;
		throw new Error("Failed to capture request from provider");
	}
	return { ...captured, originalFetch };
}

type GatewayRequestEntry = {
	provider: string;
	endpoint: string;
	headers: Record<string, string>;
	query: unknown;
};

const AUTH_HEADERS = ["authorization", "x-api-key", "api-key", "x-goog-api-key"];

function stripAuthHeaders(headers: Record<string, string>): Record<string, string> {
	const result = { ...headers };
	for (const key of AUTH_HEADERS) {
		delete result[key];
	}
	return result;
}

function buildGatewayEntry(
	captured: CapturedRequest,
	providerName?: string,
	byok?: boolean,
): GatewayRequestEntry {
	const resolved = resolveProvider(captured.url, providerName);
	return {
		provider: resolved.name,
		endpoint: resolved.endpoint,
		headers: byok ? stripAuthHeaders(captured.headers) : captured.headers,
		query: captured.body,
	};
}

async function dispatchToGateway(
	requestBody: GatewayRequestEntry[],
	config: AiGatewayConfig,
): Promise<Response> {
	const gatewayHeaders = parseAiGatewayOptions(config.options ?? {});
	let resp: Response;

	if ("binding" in config) {
		const updatedBody = requestBody.map((obj) => ({
			...obj,
			headers: {
				...obj.headers,
				...Object.fromEntries(gatewayHeaders.entries()),
			},
		}));
		resp = await config.binding.run(updatedBody);
	} else {
		gatewayHeaders.set("Content-Type", "application/json");
		if (config.apiKey) {
			gatewayHeaders.set("cf-aig-authorization", `Bearer ${config.apiKey}`);
		}
		resp = await fetch(
			`https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gateway}`,
			{
				body: JSON.stringify(requestBody),
				headers: gatewayHeaders,
				method: "POST",
			},
		);
	}

	if (resp.status === 400) {
		const result = (await resp.clone().json()) as {
			success?: boolean;
			error?: { code: number; message: string }[];
		};
		if (result.success === false && result.error?.length && result.error[0]?.code === 2001) {
			throw new AiGatewayDoesNotExist("This AI gateway does not exist");
		}
	} else if (resp.status === 401) {
		const result = (await resp.clone().json()) as {
			success?: boolean;
			error?: { code: number; message: string }[];
		};
		if (result.success === false && result.error?.length && result.error[0]?.code === 2009) {
			throw new AiGatewayUnauthorizedError(
				"Your AI Gateway has authentication active, but you didn't provide a valid apiKey",
			);
		}
	}

	return resp;
}

function feedResponseToModel(model: InternalLanguageModelV3, resp: Response): void {
	model.config = {
		...model.config,
		fetch: () => Promise.resolve(resp),
	};
}

// ─── Single-model gateway ────────────────────────────────────────

export class AiGatewayChatLanguageModel implements LanguageModelV3 {
	readonly specificationVersion = "v3";

	private readonly innerModel: InternalLanguageModelV3;
	private readonly gatewayConfig: AiGatewayConfig;
	private readonly providerName?: string;
	private readonly byok: boolean;

	get modelId() {
		return this.innerModel.modelId;
	}

	get provider() {
		return this.innerModel.provider;
	}

	get supportedUrls() {
		return this.innerModel.supportedUrls;
	}

	constructor(
		model: LanguageModelV3,
		config: AiGatewayConfig,
		providerName?: string,
		byok?: boolean,
	) {
		this.innerModel = model as InternalLanguageModelV3;
		this.gatewayConfig = config;
		this.providerName = providerName;
		this.byok = byok ?? false;
	}

	async doGenerate(
		options: Parameters<LanguageModelV3["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doGenerate"]>>> {
		return this.processRequest<LanguageModelV3["doGenerate"]>(options, "doGenerate");
	}

	async doStream(
		options: Parameters<LanguageModelV3["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doStream"]>>> {
		return this.processRequest<LanguageModelV3["doStream"]>(options, "doStream");
	}

	private async processRequest<
		T extends LanguageModelV3["doStream"] | LanguageModelV3["doGenerate"],
	>(
		options: Parameters<T>[0],
		method: "doStream" | "doGenerate",
	): Promise<Awaited<ReturnType<T>>> {
		const captured = await captureModelRequest(this.innerModel, options, method);
		const entry = buildGatewayEntry(captured, this.providerName, this.byok);
		const resp = await dispatchToGateway([entry], this.gatewayConfig);
		feedResponseToModel(this.innerModel, resp);
		const result = await (this.innerModel[method](options) as Promise<Awaited<ReturnType<T>>>);
		this.innerModel.config!.fetch = captured.originalFetch;
		return result;
	}
}

// ─── Fallback model ──────────────────────────────────────────────

class AiGatewayFallbackModel implements LanguageModelV3 {
	readonly specificationVersion = "v3";

	private readonly models: InternalLanguageModelV3[];
	private readonly gatewayConfig: AiGatewayConfig;
	private readonly byok: boolean;

	get modelId() {
		return this.models[0]!.modelId;
	}

	get provider() {
		return this.models[0]!.provider;
	}

	get supportedUrls() {
		return this.models[0]!.supportedUrls;
	}

	constructor(models: LanguageModelV3[], config: AiGatewayConfig, byok?: boolean) {
		this.models = models as InternalLanguageModelV3[];
		this.gatewayConfig = config;
		this.byok = byok ?? false;
	}

	async doGenerate(
		options: Parameters<LanguageModelV3["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doGenerate"]>>> {
		return this.processRequest<LanguageModelV3["doGenerate"]>(options, "doGenerate");
	}

	async doStream(
		options: Parameters<LanguageModelV3["doStream"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV3["doStream"]>>> {
		return this.processRequest<LanguageModelV3["doStream"]>(options, "doStream");
	}

	private async processRequest<
		T extends LanguageModelV3["doStream"] | LanguageModelV3["doGenerate"],
	>(
		options: Parameters<T>[0],
		method: "doStream" | "doGenerate",
	): Promise<Awaited<ReturnType<T>>> {
		const entries: GatewayRequestEntry[] = [];
		const originalFetches: (FetchFunction | undefined)[] = [];

		for (const model of this.models) {
			const captured = await captureModelRequest(model, options, method);
			entries.push(buildGatewayEntry(captured, undefined, this.byok));
			originalFetches.push(captured.originalFetch);
		}

		const resp = await dispatchToGateway(entries, this.gatewayConfig);

		const step = Number.parseInt(resp.headers.get("cf-aig-step") ?? "0", 10);
		const selectedModel = this.models[step];
		if (!selectedModel) {
			throw new Error("Unexpected AI Gateway fallback step");
		}

		feedResponseToModel(selectedModel, resp);
		const result = await (selectedModel[method](options) as Promise<Awaited<ReturnType<T>>>);

		for (let i = 0; i < this.models.length; i++) {
			this.models[i]!.config!.fetch = originalFetches[i];
		}

		return result;
	}
}

// ─── Public API ──────────────────────────────────────────────────

export function createAIGateway<P extends (...args: any[]) => LanguageModelV3>(
	config: AiGatewayConfig & {
		provider: P;
		providerName?: string;
		byok?: boolean;
	},
): (...args: Parameters<P>) => LanguageModelV3 {
	const { provider, providerName, byok, ...gatewayConfig } = config;
	return (...args: Parameters<P>) => {
		const model = provider(...args);
		return new AiGatewayChatLanguageModel(
			model,
			gatewayConfig as AiGatewayConfig,
			providerName,
			byok,
		);
	};
}

export function createAIGatewayFallback(
	config: AiGatewayConfig & { models: LanguageModelV3[]; byok?: boolean },
): LanguageModelV3 {
	const { models, byok, ...gatewayConfig } = config;
	if (models.length === 0) {
		throw new Error("createAIGatewayFallback requires at least one model");
	}
	return new AiGatewayFallbackModel(models, gatewayConfig as AiGatewayConfig, byok);
}

export function parseAiGatewayOptions(options: AiGatewayOptions): Headers {
	const headers = new Headers();

	if (options.skipCache === true) {
		headers.set("cf-aig-skip-cache", "true");
	}

	if (options.cacheTtl) {
		headers.set("cf-aig-cache-ttl", options.cacheTtl.toString());
	}

	if (options.metadata) {
		headers.set("cf-aig-metadata", JSON.stringify(options.metadata));
	}

	if (options.cacheKey) {
		headers.set("cf-aig-cache-key", options.cacheKey);
	}

	if (options.collectLog !== undefined) {
		headers.set("cf-aig-collect-log", options.collectLog === true ? "true" : "false");
	}

	if (options.eventId !== undefined) {
		headers.set("cf-aig-event-id", options.eventId);
	}

	if (options.requestTimeoutMs !== undefined) {
		headers.set("cf-aig-request-timeout", options.requestTimeoutMs.toString());
	}

	if (options.retries !== undefined) {
		if (options.retries.maxAttempts !== undefined) {
			headers.set("cf-aig-max-attempts", options.retries.maxAttempts.toString());
		}
		if (options.retries.retryDelayMs !== undefined) {
			headers.set("cf-aig-retry-delay", options.retries.retryDelayMs.toString());
		}
		if (options.retries.backoff !== undefined) {
			headers.set("cf-aig-backoff", options.retries.backoff);
		}
	}

	if (options.byokAlias !== undefined) {
		headers.set("cf-aig-byok-alias", options.byokAlias);
	}

	if (options.zdr !== undefined) {
		headers.set("cf-aig-zdr", options.zdr ? "true" : "false");
	}

	return headers;
}
