import { createAnthropic as _createAnthropic } from "@ai-sdk/anthropic";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createAnthropic = wrapWithDeprecationWarning(
	_createAnthropic,
	"ai-gateway-provider/providers/anthropic",
	"@ai-sdk/anthropic",
);
