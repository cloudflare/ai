import { createAmazonBedrock as _createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createAmazonBedrock = wrapWithDeprecationWarning(
	_createAmazonBedrock,
	"ai-gateway-provider/providers/amazon-bedrock",
	"@ai-sdk/amazon-bedrock",
);
