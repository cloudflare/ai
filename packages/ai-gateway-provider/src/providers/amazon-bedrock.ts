import { createAmazonBedrock as createAmazonBedrockOriginal } from "@ai-sdk/amazon-bedrock";
import { authWrapper } from "../auth";

/**
 * @deprecated Use `createAmazonBedrock` from `@ai-sdk/amazon-bedrock` with `createAI` from
 * `agents/models/ai-sdk`, which routes the model through AI Gateway and
 * strips the vendor key unless you set `vendorKey: "request"`.
 */
export const createAmazonBedrock = (...args: Parameters<typeof createAmazonBedrockOriginal>) =>
	authWrapper(createAmazonBedrockOriginal)(...args);
