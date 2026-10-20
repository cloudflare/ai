import { createVertex as createVertexOriginal } from "@ai-sdk/google-vertex/edge";
import { CF_TEMP_TOKEN } from "../auth";

/**
 * @deprecated Use `createVertex` from `@ai-sdk/google-vertex/edge` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createVertex = (...args: Parameters<typeof createVertexOriginal>) => {
	let [config] = args;
	if (config === undefined) {
		config = { googleCredentials: { cfApiKey: CF_TEMP_TOKEN } } as any;
	}
	// no google credentials and no express mode apikey
	else if (config.googleCredentials === undefined && config.apiKey === undefined) {
		config.googleCredentials = { cfApiKey: CF_TEMP_TOKEN } as any;
	}
	return createVertexOriginal(config);
};
