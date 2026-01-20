import type { EmbeddingModelV3 } from "@ai-sdk/provider";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { CF_TEMP_TOKEN } from "./auth";
import { providers } from "./providers";
import {
	AiGatewayDoesNotExist,
	AiGatewayInternalFetchError,
	AiGatewayUnauthorizedError,
	parseAiGatewayOptions,
	streamToObject,
	type AiGatewaySettings,
} from "./shared";

type InternalEmbeddingModelV3 = EmbeddingModelV3 & {
	config?: { fetch?: FetchFunction | undefined };
};

export class AiGatewayEmbeddingModel implements EmbeddingModelV3 {
	readonly specificationVersion = "v3";

	readonly models: InternalEmbeddingModelV3[];
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

	get maxEmbeddingsPerCall(): PromiseLike<number | undefined> | number | undefined {
		if (!this.models[0]) {
			throw new Error("models cannot be empty array");
		}

		return this.models[0].maxEmbeddingsPerCall;
	}

	get supportsParallelCalls(): PromiseLike<boolean> | boolean {
		if (!this.models[0]) {
			throw new Error("models cannot be empty array");
		}

		return this.models[0].supportsParallelCalls;
	}

	constructor(models: EmbeddingModelV3[], config: AiGatewaySettings) {
		this.models = models;
		this.config = config;
	}

	async doEmbed(
		options: Parameters<EmbeddingModelV3["doEmbed"]>[0],
	): Promise<Awaited<ReturnType<EmbeddingModelV3["doEmbed"]>>> {
		const requests: { url: string; request: Request; modelProvider: string }[] = [];

		// Model configuration and request collection
		for (const model of this.models) {
			if (!model.config || !Object.keys(model.config).includes("fetch")) {
				throw new Error(
					`Sorry, but provider "${model.provider}" is currently not supported for embeddings, please open an issue in the github repo!`,
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
				await model.doEmbed(options);
			} catch (e) {
				if (!(e instanceof AiGatewayInternalFetchError)) {
					throw e;
				}
			}
		}

		// Process requests
		const body = await Promise.all(
			requests.map(async (req) => {
				let providerConfig = null;
				for (const provider of providers) {
					if (provider.regex.test(req.url)) {
						providerConfig = provider;
					}
				}

				if (!providerConfig) {
					throw new Error(
						`Sorry, but provider "${req.modelProvider}" is currently not supported for embeddings, please open an issue in the github repo!`,
					);
				}

				if (!req.request.body) {
					throw new Error("AI Gateway provider received an unexpected empty body");
				}

				// For AI Gateway BYOK / unified billing requests
				// delete the fake injected CF_TEMP_TOKEN
				const authHeader = providerConfig.headerKey ?? "authorization";
				const authValue =
					"get" in req.request.headers
						? req.request.headers.get(authHeader)
						: req.request.headers[authHeader];
				if (authValue?.indexOf(CF_TEMP_TOKEN) !== -1) {
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
			resp = await this.config.binding.run(updatedBody);
		} else {
			headers.set("Content-Type", "application/json");
			headers.set("cf-aig-authorization", `Bearer ${this.config.apiKey}`);
			resp = await fetch(
				`https://gateway.ai.cloudflare.com/v1/${this.config.accountId}/${this.config.gateway}`,
				{
					body: JSON.stringify(body),
					headers: headers,
					method: "POST",
				},
			);
		}

		// Error handling
		if (resp.status === 400) {
			const cloneResp = resp.clone();
			const result: {
				success?: boolean;
				error?: { code: number; message: string }[];
			} = await cloneResp.json();
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
			const result: {
				success?: boolean;
				error?: { code: number; message: string }[];
			} = await cloneResp.json();
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

		const step = Number.parseInt(resp.headers.get("cf-aig-step") ?? "0", 10);
		if (!this.models[step]) {
			throw new Error("Unexpected AI Gateway Error");
		}

		this.models[step].config = {
			...this.models[step].config,
			fetch: (_url, _req) => resp as unknown as Promise<Response>,
		};

		return this.models[step].doEmbed(options);
	}
}
