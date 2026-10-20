import { createXai as createXaiOriginal } from "@ai-sdk/xai";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createXai` from `@ai-sdk/xai` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createXai = (...args: Parameters<typeof createXaiOriginal>) =>
	authWrapper(createXaiOriginal)(...args);
