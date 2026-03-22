import { createGroq as _createGroq } from "@ai-sdk/groq";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createGroq = wrapWithDeprecationWarning(
	_createGroq,
	"ai-gateway-provider/providers/groq",
	"@ai-sdk/groq",
);
