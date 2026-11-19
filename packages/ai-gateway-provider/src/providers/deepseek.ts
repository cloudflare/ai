import { createDeepSeek as createDeepSeekOriginal } from "@ai-sdk/deepseek";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createDeepSeek` from `@ai-sdk/deepseek` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createDeepSeek = (...args: Parameters<typeof createDeepSeekOriginal>) =>
	authWrapper(createDeepSeekOriginal)(...args);
