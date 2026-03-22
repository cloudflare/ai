import { createVertex as _createVertex } from "@ai-sdk/google-vertex";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createVertex = wrapWithDeprecationWarning(
	_createVertex,
	"ai-gateway-provider/providers/google-vertex",
	"@ai-sdk/google-vertex",
);
