import { createVertex as createVertexOriginal } from "@ai-sdk/google-vertex/edge";
import { CF_TEMP_TOKEN } from "../auth";

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
}
