export class AiGatewayInternalFetchError extends Error {}

export class AiGatewayDoesNotExist extends Error {}

export class AiGatewayUnauthorizedError extends Error {}

export async function streamToObject(stream: ReadableStream) {
	const response = new Response(stream);
	return await response.json();
}

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
};

export type AiGatewayAPISettings = {
	gateway: string;
	accountId: string;
	apiKey?: string;
	options?: AiGatewayOptions;
};

export type AiGatewayBindingSettings = {
	binding: {
		run(data: unknown): Promise<Response>;
	};
	options?: AiGatewayOptions;
};

export type AiGatewaySettings = AiGatewayAPISettings | AiGatewayBindingSettings;

export function parseAiGatewayOptions(options: AiGatewayOptions): Headers {
	const headers = new Headers();

	if (options.skipCache === true) {
		headers.set("cf-skip-cache", "true");
	}

	if (options.cacheTtl) {
		headers.set("cf-cache-ttl", options.cacheTtl.toString());
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

	return headers;
}
