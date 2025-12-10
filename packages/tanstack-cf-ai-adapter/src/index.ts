/**
 * @harshil1712/tanstack-cf-ai-adapter
 *
 * Cloudflare AI Gateway adapter for TanStack AI.
 * Routes AI requests through Cloudflare's AI Gateway for caching,
 * rate limiting, cost controls, and observability.
 *
 * @packageDocumentation
 */

// OpenAI Gateway Adapter
export {
  openaiGateway,
  OpenAIGatewayAdapter,
  isStandardAuth as isOpenAIStandardAuth,
  isBYOKAuth as isOpenAIBYOKAuth,
  isUnifiedBillingAuth as isOpenAIUnifiedBillingAuth,
} from './adapters/openai-gateway'

export type {
  OpenAIGatewayAuthConfig,
  StandardAuthConfig as OpenAIStandardAuthConfig,
  BYOKAuthConfig as OpenAIBYOKAuthConfig,
  UnifiedBillingAuthConfig as OpenAIUnifiedBillingAuthConfig,
} from './adapters/openai-gateway'

// Anthropic Gateway Adapter
export {
  anthropicGateway,
  AnthropicGatewayAdapter,
  isStandardAuth as isAnthropicStandardAuth,
  isBYOKAuth as isAnthropicBYOKAuth,
  isUnifiedBillingAuth as isAnthropicUnifiedBillingAuth,
} from './adapters/anthropic-gateway'

export type {
  AnthropicGatewayAuthConfig,
  StandardAuthConfig as AnthropicStandardAuthConfig,
  BYOKAuthConfig as AnthropicBYOKAuthConfig,
  UnifiedBillingAuthConfig as AnthropicUnifiedBillingAuthConfig,
} from './adapters/anthropic-gateway'

// Core types
export type {
  AIBinding,
  AIGatewayInstance,
} from './types'

export { PROVIDER_MAPPING } from './types'
