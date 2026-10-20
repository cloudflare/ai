import { createOpenRouter as createOpenRouterOriginal } from "@openrouter/ai-sdk-provider";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createOpenRouter` from `@openrouter/ai-sdk-provider` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createOpenRouter = (...args: Parameters<typeof createOpenRouterOriginal>) =>
	authWrapper(createOpenRouterOriginal)(...args);
