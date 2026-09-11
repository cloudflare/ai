/**
 * `@cloudflare/gateway-core` — private, source-only shared core for the
 * Cloudflare AI Gateway packages.
 *
 * This package is never published. It ships raw TypeScript that each consumer
 * (`workers-ai-provider`, `@cloudflare/tanstack-ai`, `ai-gateway-provider`)
 * bundles inline via tsdown (`deps.alwaysBundle` for JS + `deps.dts.alwaysBundle`
 * for declarations), so the consumer's own target/format/dts settings apply.
 * That keeps a single source of truth for the provider registry, gateway-fetch/
 * header builders, the resumable-stream engine, and the Workers AI SSE helpers
 * without a published->published runtime dependency.
 */

export { GatewayDelegateError, type GatewayDelegateErrorKind } from "./errors";
export {
	applyGatewayCacheHeaders,
	asText,
	buildGatewayEntry,
	type BuildGatewayEntryParams,
	type GatewayCacheOptions,
	type GatewayEntry,
	type GatewayMetadata,
	type GatewayRetryOptions,
	headersToObject,
	serializeMetadata,
	STRIP_HEADERS_BASE,
} from "./gateway-fetch";
export {
	type Billing,
	detectProviderByUrl,
	findProviderBySlug,
	GATEWAY_PROVIDERS,
	type GatewayProviderInfo,
	type WireFormat,
	wireableProviders,
} from "./gateway-providers";
export {
	createResumableStream,
	type ResumableStreamOptions,
	type ResumeExpiredPolicy,
} from "./resumable-stream";
export {
	getToolNames,
	isForcedToolChoice,
	type NeutralToolCall,
	normalizeMessagesForBinding,
	parseLeakedToolCalls,
	processText,
	SSEDecoder,
} from "./workers-ai";
export {
	isAbortError,
	isExplicitlyRetryable,
	isRetryableStatus,
	messageOf,
	parseWorkersAIErrorCode,
	WORKERS_AI_ERROR_CODE_TO_STATUS,
	workersAIStatusFromError,
} from "./workers-ai-errors";
