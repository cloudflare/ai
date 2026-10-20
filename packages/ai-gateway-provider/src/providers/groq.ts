import { createGroq as createGroqOriginal } from "@ai-sdk/groq";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createGroq` from `@ai-sdk/groq` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createGroq = (...args: Parameters<typeof createGroqOriginal>) =>
	authWrapper(createGroqOriginal)(...args);
