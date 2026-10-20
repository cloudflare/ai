import { createOpenAI as createOpenAIOriginal } from "@ai-sdk/openai";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createOpenAI` from `@ai-sdk/openai` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createOpenAI = (...args: Parameters<typeof createOpenAIOriginal>) =>
	authWrapper(createOpenAIOriginal)(...args);
