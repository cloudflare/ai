import { createAzure as _createAzure } from "@ai-sdk/azure";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createAzure = wrapWithDeprecationWarning(
	_createAzure,
	"ai-gateway-provider/providers/azure",
	"@ai-sdk/azure",
);
