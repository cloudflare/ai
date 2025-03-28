import type {
	LanguageModelV1,
	LanguageModelV1CallOptions,
	LanguageModelV1CallWarning,
	LanguageModelV1StreamPart,
} from "@ai-sdk/provider";
import type { FetchFunction } from "@ai-sdk/provider-utils";

export class AiGatewayInternalFetchError extends Error {}

export class AiGatewayDoesNotExist extends Error {}

export class AiGatewayUnauthorizedError extends Error {}

async function streamToObject(stream: ReadableStream) {
	const response = new Response(stream);
	return await response.json();
}

const ProvidersConfigs = [
	{
		url: "https://api.openai.com/",
		name: "openai",
	},
	{
		url: "https://api.deepseek.com/",
		name: "deepseek",
	},
	{
		url: "https://api.anthropic.com/",
		name: "anthropic",
	},
	{
		url: "https://generativelanguage.googleapis.com/",
		name: "google-ai-studio",
	},
	{
		url: "https://api.x.ai/",
		name: "grok",
	},
	{
		url: "https://api.mistral.ai/",
		name: "mistral",
	},
	{
		url: "https://api.perplexity.ai/",
		name: "perplexity-ai",
	},
	{
		url: "https://api.replicate.com/",
		name: "replicate",
	},
	{
		url: "https://api.groq.com/openai/v1/",
		name: "groq",
	},
];

type InternalLanguageModelV1 = LanguageModelV1 & { config?: { fetch?: FetchFunction | undefined } };

export class AiGatewayChatLanguageModel implements LanguageModelV1 {
	readonly specificationVersion = "v1";
	readonly defaultObjectGenerationMode = "json";

	readonly models: InternalLanguageModelV1[];
	readonly config: AiGatewaySettings;

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

	constructor(models: LanguageModelV1[], config: AiGatewaySettings) {
		this.models = models;
		this.config = config;
	}

	doStream(options: LanguageModelV1CallOptions): PromiseLike<{
		stream: ReadableStream<LanguageModelV1StreamPart>;
		rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
		rawResponse?: { headers?: Record<string, string> };
		request?: { body?: string };
		warnings?: Array<LanguageModelV1CallWarning>;
	}> {
		throw new Error("Method not implemented.");
	}

	async doGenerate(
		options: Parameters<LanguageModelV1["doGenerate"]>[0],
	): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
		const requests: { url: string; request: Request; modelProvider: string }[] = [];

		for (const model of this.models) {
			if (!model.config || !Object.keys(model.config).includes("fetch")) {
				throw new Error(
					`Sorry, but provider "${model.provider}" is currently not supported, please open a issue in the github repo!`,
				);
			}

			model.config.fetch = (url, request) => {
				requests.push({
					url: url as string,
					request: request as Request,
					modelProvider: model.provider,
				});
				throw new AiGatewayInternalFetchError("Stopping provider execution...");
			};

			try {
				await model.doGenerate(options);
			} catch (e) {
				if (!(e instanceof AiGatewayInternalFetchError)) {
					throw e;
				}
			}
		}

		const body = await Promise.all(
			requests.map(async (req) => {
				let providerConfig = null;
				for (const provider of ProvidersConfigs) {
					if (req.url.includes(provider.url)) {
						providerConfig = provider;
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

				return {
					provider: providerConfig.name,
					endpoint: req.url.replace(providerConfig.url, ""),
					headers: req.request.headers,
					query: await streamToObject(req.request.body),
				};
			}),
		);

		const headers = parseAiGatewayOptions(this.config.options ?? {});

		let resp: Response;
		if ("binding" in this.config) {
			const updatedBody = body.map((obj) => {
				return {
					...obj,
					headers: {
						...(obj.headers ?? {}),
						...Object.fromEntries(headers.entries()),
					},
				};
			});

			resp = await this.config.binding.run(updatedBody);
		} else {
			headers.set("Content-Type", "application/json");
			headers.set("cf-aig-authorization", `Bearer ${this.config.apiKey}`);

			resp = await fetch(
				`https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gateway}`,
				{
					method: "POST",
					headers: headers,
					body: JSON.stringify(body),
				},
			);
		}

		if (resp.status === 400) {
			const cloneResp = resp.clone();
			const result: { success?: boolean; error?: { code: number; message: string }[] } =
				await cloneResp.json();
			if (
				result.success === false &&
				result.error &&
				result.error.length > 0 &&
				result.error[0]?.code === 2001
			) {
				throw new AiGatewayDoesNotExist("This AI gateway does not exist");
			}
		} else if (resp.status === 401) {
			const cloneResp = resp.clone();
			const result: { success?: boolean; error?: { code: number; message: string }[] } =
				await cloneResp.json();
			if (
				result.success === false &&
				result.error &&
				result.error.length > 0 &&
				result.error[0]?.code === 2009
			) {
				throw new AiGatewayUnauthorizedError(
					"Your AI Gateway has authentication active, but you didn't provide a valid apiKey",
				);
			}
		}

		const step = Number.parseInt(resp.headers.get("cf-aig-step") ?? "0");

		if (!this.models[step]) {
			throw new Error("Unexpected AI Gateway Error");
		}

		this.models[step].config = {
			...this.models[step].config,
			fetch: (url, req) => resp as unknown as Promise<Response>,
		};
		return this.models[step].doGenerate(options);
	}
}

export interface AiGateway {
	(models: LanguageModelV1 | LanguageModelV1[]): LanguageModelV1;

	chat(models: LanguageModelV1 | LanguageModelV1[]): LanguageModelV1;
}

export type AiGatewayReties = {
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
	retries?: AiGatewayReties;
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

export function createAiGateway(options: AiGatewaySettings): AiGateway {
	const createChatModel = (models: LanguageModelV1 | LanguageModelV1[]) => {
		return new AiGatewayChatLanguageModel(Array.isArray(models) ? models : [models], options);
	};

	const provider = (models: LanguageModelV1 | LanguageModelV1[]) => createChatModel(models);

	provider.chat = createChatModel;

	return provider;
}

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
