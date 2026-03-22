import { createGoogleGenerativeAI as _createGoogleGenerativeAI } from "@ai-sdk/google";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createGoogleGenerativeAI = wrapWithDeprecationWarning(
	_createGoogleGenerativeAI,
	"ai-gateway-provider/providers/google",
	"@ai-sdk/google",
);
