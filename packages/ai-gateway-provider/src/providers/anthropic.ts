import { createAnthropic as createAnthropicOriginal } from "@ai-sdk/anthropic";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createAnthropic` from `@ai-sdk/anthropic` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createAnthropic = (...args: Parameters<typeof createAnthropicOriginal>) =>
	authWrapper(createAnthropicOriginal)(...args);
