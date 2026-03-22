import { createDeepgram as _createDeepgram } from "@ai-sdk/deepgram";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createDeepgram = wrapWithDeprecationWarning(
	_createDeepgram,
	"ai-gateway-provider/providers/deepgram",
	"@ai-sdk/deepgram",
);
