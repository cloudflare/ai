import { createElevenLabs as createElevenLabsOriginal } from "@ai-sdk/elevenlabs";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createElevenLabs` from `@ai-sdk/elevenlabs` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createElevenLabs = (...args: Parameters<typeof createElevenLabsOriginal>) =>
	authWrapper(createElevenLabsOriginal)(...args);
