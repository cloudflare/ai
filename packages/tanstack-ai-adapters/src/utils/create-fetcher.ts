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
	 * The OpenAI API Key if you want to manually pass it, ignore if using Unified Billing or BYOK.
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

export function createGatewayFetch(
	provider: string,
	config: AiGatewayAdapterConfig,
	headers: Record<string, unknown> = {},
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

		const cacheHeaders: Record<string, string | number | boolean> = {};

		if ("skipCache" in config && config.skipCache) {
			cacheHeaders["cf-aig-skip-cache"] = true;
		}

		if (typeof config.cacheTtl === "number") {
			cacheHeaders["cf-aig-cache-ttl"] = config.cacheTtl;
		}

		if (typeof config.customCacheKey === "string") {
			cacheHeaders["cf-aig-cache-key"] = config.customCacheKey;
		}

		if (typeof config.metadata === "object") {
			cacheHeaders["cf-aig-metadata"] = JSON.stringify(config.metadata);
		}

		const request = {
			provider,
			endpoint,
			headers: {
				...init?.headers,
				...headers,
				...cacheHeaders,
				"Content-Type": "application/json",
			} as Record<string, string>,
			query,
		};

		if (provider === "workers-ai") {
			request.endpoint = query.model as string;
			delete query.model;
			delete query.intructions;
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
