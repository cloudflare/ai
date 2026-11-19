import { createPerplexity as createPerplexityOriginal } from "@ai-sdk/perplexity";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createPerplexity` from `@ai-sdk/perplexity` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createPerplexity = (...args: Parameters<typeof createPerplexityOriginal>) =>
	authWrapper(createPerplexityOriginal)(...args);
