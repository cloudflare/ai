export interface CloudflareAiGateway {
	run(request: unknown): Promise<Response>;
}

export type AiGatewayBindingConfig = {
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
};

export type AiGatewayCredentialsConfig = {
	/**
	 * The Cloudflare account ID
	 */
	accountId: string;
	/**
	 * The AI Gateway ID
	 */
	gatewayId: string;
	/**
	 * The OpenAI API Key if you want to manually pass it, ignore if using Unified Billing or BYOK.
	 */
	apiKey?: string;
	/**
	 * The Cloudflare AI Gateway API Key, required if your Gateway is authenticated.
	 */
	cfApiKey?: string;
};

export type AiGatewayConfig = AiGatewayBindingConfig | AiGatewayCredentialsConfig;

export function createGatewayFetch(
	provider: string,
	config: AiGatewayConfig,
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

		const request = {
			provider,
			endpoint,
			headers: {
				...init?.headers,
				...headers,
				"Content-Type": "application/json",
			} as Record<string, string>,
			query,
		};

		if ("binding" in config) {
			return config.binding.run(request);
		}

		if (config.apiKey) {
			request.headers["authorization"] = `Bearer ${config.apiKey}`;
		}

		return fetch(
			`https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}`,
			{
				...init,
				headers: {
					"Content-Type": "application/json",
					...headers,
					...(config.cfApiKey
						? { "cf-aig-authorization": `Bearer ${config.cfApiKey}` }
						: {}),
				},
				body: JSON.stringify(request),
			},
		);
	};
}
