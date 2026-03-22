import { createPerplexity as _createPerplexity } from "@ai-sdk/perplexity";
import { wrapWithDeprecationWarning } from "./deprecation-warning";

export const createPerplexity = wrapWithDeprecationWarning(
	_createPerplexity,
	"ai-gateway-provider/providers/perplexity",
	"@ai-sdk/perplexity",
);
