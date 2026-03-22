import { createOpenAI as _createOpenAI } from "@ai-sdk/openai";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createOpenAI = wrapWithDeprecationWarning(
	_createOpenAI,
	"ai-gateway-provider/providers/openai",
	"@ai-sdk/openai",
);
