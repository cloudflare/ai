import { createDeepSeek as _createDeepSeek } from "@ai-sdk/deepseek";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createDeepSeek = wrapWithDeprecationWarning(
	_createDeepSeek,
	"ai-gateway-provider/providers/deepseek",
	"@ai-sdk/deepseek",
);
