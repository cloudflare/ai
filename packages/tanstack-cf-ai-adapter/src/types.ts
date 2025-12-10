import type { AIAdapter } from '@tanstack/ai'

/**
 * Cloudflare Workers AI binding with AI Gateway support
 * Configure in wrangler.toml:
 * [ai]
 * binding = "AI"
 */
export interface AIBinding {
  /**
   * Access AI Gateway functionality
   * @param gatewayName - The name of your AI Gateway (created in dashboard)
   */
  gateway(gatewayName: string): AIGatewayInstance
}

/**
 * AI Gateway instance with methods for interacting with the gateway
 */
export interface AIGatewayInstance {
  /**
   * Get the gateway URL for a specific provider
   * @param provider - Provider name (e.g., 'openai', 'anthropic', 'google-ai-studio')
   * @returns Promise<string> - The gateway URL to use as baseURL
   */
  getUrl(provider: string): Promise<string>

  /**
   * Execute a universal request through the gateway
   * @param options - Request options including provider, endpoint, headers, etc.
   */
  run(options: UniversalRequestOptions): Promise<Response>

  /**
   * Send feedback and metadata for a specific log
   * @param logId - The log ID to update
   * @param patch - Patch data including feedback, score, metadata
   */
  patchLog(logId: string, patch: LogPatch): Promise<void>

  /**
   * Retrieve detailed log information
   * @param logId - The log ID to retrieve
   */
  getLog(logId: string): Promise<any>
}

/**
 * Options for universal gateway requests
 */
export interface UniversalRequestOptions {
  provider: string
  endpoint: string
  headers?: Record<string, string>
  query?: Record<string, any>
  body?: any
}

/**
 * Log patch data for feedback and metadata
 */
export interface LogPatch {
  feedback?: number
  metadata?: Record<string, any>
}

/**
 * Configuration for AI Gateway features (caching, metadata, logging)
 */
export interface GatewayFeatures {
  /**
   * Cache configuration for requests
   */
  cache?: {
    /**
     * Cache TTL in seconds
     * Requests with identical prompts will be served from cache
     */
    ttl?: number

    /**
     * Skip cache for this request
     */
    skipCache?: boolean
  }

  /**
   * Custom metadata to attach to requests
   * Useful for tracking and analytics in the AI Gateway dashboard
   */
  metadata?: Record<string, string>

  /**
   * Logging configuration
   */
  logging?: {
    /**
     * Skip logging for this request
     */
    skipLogging?: boolean
  }
}

/**
 * Authentication configuration for AI Gateway
 * Supports three modes:
 * 1. Standard: Pass provider API key directly
 * 2. BYOK (Stored Keys): Reference keys stored in Cloudflare dashboard
 * 3. Unified Billing: Use Cloudflare token, no provider keys needed
 */
export type AuthConfig =
  | StandardAuth
  | BYOKAuth
  | UnifiedBillingAuth

/**
 * Standard authentication - pass provider API key directly
 */
export interface StandardAuth {
  /**
   * Provider's API key (e.g., OpenAI API key, Anthropic API key)
   */
  apiKey: string
}

/**
 * BYOK (Bring Your Own Keys) authentication
 * Keys are stored in Cloudflare dashboard and referenced by name
 */
export interface BYOKAuth {
  /**
   * Reference to the stored key in Cloudflare dashboard
   * Set up in: AI Gateway → Provider Keys → Add API Key
   */
  storedKey: string

  /**
   * Cloudflare API token for cf-aig-authorization header
   */
  cfToken: string
}

/**
 * Unified Billing authentication
 * Use Cloudflare's unified billing - no provider API keys needed
 */
export interface UnifiedBillingAuth {
  /**
   * Enable unified billing mode
   */
  unifiedBilling: true

  /**
   * Cloudflare API token for cf-aig-authorization header
   */
  cfToken: string
}

/**
 * Complete configuration for gateway adapter creation
 */
export interface GatewayAdapterConfig extends GatewayFeatures {
  /**
   * Authentication configuration
   */
  auth: AuthConfig

  /**
   * Additional provider-specific configuration
   * (e.g., organization for OpenAI)
   */
  providerConfig?: Record<string, any>
}

/**
 * Map adapter names to Cloudflare AI Gateway provider identifiers
 */
export const PROVIDER_MAPPING: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  gemini: 'google-ai-studio',
  'google-ai-studio': 'google-ai-studio',
  groq: 'groq',
  cohere: 'cohere',
  mistral: 'mistral',
  perplexity: 'perplexity',
  deepseek: 'deepseek',
  grok: 'grok',
  'workers-ai': 'workers-ai',
}

/**
 * Type guard to check if auth config is standard auth
 */
export function isStandardAuth(auth: AuthConfig): auth is StandardAuth {
  return 'apiKey' in auth
}

/**
 * Type guard to check if auth config is BYOK auth
 */
export function isBYOKAuth(auth: AuthConfig): auth is BYOKAuth {
  return 'storedKey' in auth
}

/**
 * Type guard to check if auth config is unified billing auth
 */
export function isUnifiedBillingAuth(auth: AuthConfig): auth is UnifiedBillingAuth {
  return 'unifiedBilling' in auth && auth.unifiedBilling === true
}
