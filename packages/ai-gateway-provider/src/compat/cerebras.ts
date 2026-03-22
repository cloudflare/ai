import { createCerebras as _createCerebras } from "@ai-sdk/cerebras";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createCerebras = wrapWithDeprecationWarning(
	_createCerebras,
	"ai-gateway-provider/providers/cerebras",
	"@ai-sdk/cerebras",
);
