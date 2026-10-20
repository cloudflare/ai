import { createCerebras as createCerebrasOriginal } from "@ai-sdk/cerebras";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createCerebras` from `@ai-sdk/cerebras` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createCerebras = (...args: Parameters<typeof createCerebrasOriginal>) =>
	authWrapper(createCerebrasOriginal)(...args);
