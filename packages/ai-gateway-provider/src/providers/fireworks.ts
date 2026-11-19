import { createFireworks as createFireworksOriginal } from "@ai-sdk/fireworks";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createFireworks` from `@ai-sdk/fireworks` directly.
 */
export const createFireworks = (...args: Parameters<typeof createFireworksOriginal>) =>
	authWrapper(createFireworksOriginal)(...args);
