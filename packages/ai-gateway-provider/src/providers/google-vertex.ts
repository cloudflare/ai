import { createVertex as createVertexOriginal } from "@ai-sdk/google-vertex/edge";
import { CF_TEMP_TOKEN } from "../auth";

export const createVertex = (...args: Parameters<typeof createVertexOriginal>) => {
    let [config] = args;
    if (config === undefined) {
        config = { googleCredentials: { apiKey: CF_TEMP_TOKEN } };
    }
    if (config.googleCredentials === undefined) {
        config.googleCredentials = { apiKey: CF_TEMP_TOKEN };
    }
    return createVertexOriginal(config);
}