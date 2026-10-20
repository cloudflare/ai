import { createCohere as createCohereOriginal } from "@ai-sdk/cohere";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createCohere` from `@ai-sdk/cohere` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createCohere = (...args: Parameters<typeof createCohereOriginal>) =>
	authWrapper(createCohereOriginal)(...args);
