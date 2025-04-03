/**
 * General AI run interface with overloads to handle distinct return types.
 *
 * The behaviour depends on the combination of parameters:
 * 1. `returnRawResponse: true` => returns the raw Response object.
 * 2. `stream: true`           => returns a ReadableStream (if available).
 * 3. Otherwise                => returns post-processed AI results.
 */
export interface AiRun {
	// (1) Return raw Response if `options.returnRawResponse` is `true`.
	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options: AiOptions & { returnRawResponse: true },
	): Promise<Response>;

	// (2) Return a stream if the input has `stream: true`.
	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"] & { stream: true },
		options?: AiOptions,
	): Promise<ReadableStream<Uint8Array>>;

	// (3) Return post-processed outputs by default.
	<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options?: AiOptions,
	): Promise<AiModels[Name]["postProcessedOutputs"]>;
}

export type StringLike = string | { toString(): string };

/**
 * Parameters for configuring the Cloudflare-based AI runner.
 */
export interface CreateRunConfig {
	/** Your Cloudflare account identifier. */
	accountId: string;

	/** Cloudflare API token/key with appropriate permissions. */
	apiKey: string;
}

/**
 * Creates a run method that emulates the Cloudflare Workers AI binding,
 * but uses the Cloudflare REST API under the hood. Headers and abort
 * signals are configured at creation time, rather than per-request.
 *
 * @param config An object containing:
 *   - `accountId`: Cloudflare account identifier.
 *   - `apiKey`: Cloudflare API token/key with suitable permissions.
 *   - `headers`: Optional custom headers to merge with defaults.
 *   - `signal`: Optional AbortSignal for request cancellation.
 *
 * @returns A function matching the AiRun interface.
 */
export function createRun(config: CreateRunConfig): AiRun {
	const { accountId, apiKey } = config;

	// Return the AiRun-compatible function.
	return async function run<Name extends keyof AiModels>(
		model: Name,
		inputs: AiModels[Name]["inputs"],
		options?: AiOptions & Record<string, StringLike>,
	): Promise<Response | ReadableStream<Uint8Array> | AiModels[Name]["postProcessedOutputs"]> {
		const { gateway, prefix, extraHeaders, returnRawResponse, ...passthroughOptions } =
			options || {};

		const urlParams = new URLSearchParams();
		for (const [key, value] of Object.entries(passthroughOptions)) {
			// throw a useful error if the value is not to-stringable
			try {
				const valueStr = value.toString();
				if (!valueStr) {
					continue;
				}
				urlParams.append(key, valueStr);
			} catch (error) {
				throw new Error(
					`Value for option '${key}' is not able to be coerced into a string.`,
				);
			}
		}

		const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}${urlParams ? `?${urlParams}` : ""}`;

		// Merge default and custom headers.
		const headers = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		};

		const body = JSON.stringify(inputs);

		// Execute the POST request. The optional AbortSignal is applied here.
		const response = await fetch(url, {
			method: "POST",
			headers,
			body,
		});

		// (1) If the user explicitly requests the raw Response, return it as-is.
		if (returnRawResponse) {
			return response;
		}

		// (2) If the AI input requests streaming, return the ReadableStream if available.
		if ((inputs as AiTextGenerationInput).stream === true) {
			if (response.body) {
				return response.body;
			}
			throw new Error("No readable body available for streaming.");
		}

		// (3) In all other cases, parse JSON and return the result field.
		const data = await response.json<{
			result: AiModels[Name]["postProcessedOutputs"];
		}>();
		return data.result;
	};
}
