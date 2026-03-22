import { createFireworks as _createFireworks } from "@ai-sdk/fireworks";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createFireworks = wrapWithDeprecationWarning(
	_createFireworks,
	"ai-gateway-provider/providers/fireworks",
	"@ai-sdk/fireworks",
);
