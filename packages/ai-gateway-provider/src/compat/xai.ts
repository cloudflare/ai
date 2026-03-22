import { createXai as _createXai } from "@ai-sdk/xai";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createXai = wrapWithDeprecationWarning(
	_createXai,
	"ai-gateway-provider/providers/xai",
	"@ai-sdk/xai",
);
