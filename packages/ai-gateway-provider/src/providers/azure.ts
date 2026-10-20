import { createAzure as createAzureOriginal } from "@ai-sdk/azure";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createAzure` from `@ai-sdk/azure` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createAzure = (...args: Parameters<typeof createAzureOriginal>) =>
	authWrapper(createAzureOriginal)(...args);
