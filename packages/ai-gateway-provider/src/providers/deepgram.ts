import { createDeepgram as createDeepgramOriginal } from "@ai-sdk/deepgram";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createDeepgram` from `@ai-sdk/deepgram` directly.
 */
export const createDeepgram = (...args: Parameters<typeof createDeepgramOriginal>) =>
	authWrapper(createDeepgramOriginal)(...args);
