import { createMistral as createMistralOriginal } from "@ai-sdk/mistral";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createMistral` from `@ai-sdk/mistral` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createMistral = (...args: Parameters<typeof createMistralOriginal>) =>
	authWrapper(createMistralOriginal)(...args);
