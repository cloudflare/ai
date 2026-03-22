import { createCohere as _createCohere } from "@ai-sdk/cohere";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createCohere = wrapWithDeprecationWarning(
	_createCohere,
	"ai-gateway-provider/providers/cohere",
	"@ai-sdk/cohere",
);
