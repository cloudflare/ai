import { createMistral as _createMistral } from "@ai-sdk/mistral";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createMistral = wrapWithDeprecationWarning(
	_createMistral,
	"ai-gateway-provider/providers/mistral",
	"@ai-sdk/mistral",
);
