import { createOpenRouter as _createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createOpenRouter = wrapWithDeprecationWarning(
	_createOpenRouter,
	"ai-gateway-provider/providers/openrouter",
	"@openrouter/ai-sdk-provider",
);
