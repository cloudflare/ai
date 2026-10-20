import { createGoogleGenerativeAI as createGoogleGenerativeAIOriginal } from "@ai-sdk/google";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createGoogleGenerativeAI` from `@ai-sdk/google` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createGoogleGenerativeAI = (
	...args: Parameters<typeof createGoogleGenerativeAIOriginal>
) => authWrapper(createGoogleGenerativeAIOriginal)(...args);
