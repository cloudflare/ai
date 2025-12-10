import type { AIAdapter } from '@tanstack/ai'
import type {
  AIBinding,
  GatewayAdapterConfig,
  AuthConfig,
} from './types'
import {
  PROVIDER_MAPPING,
  isStandardAuth,
  isBYOKAuth,
  isUnifiedBillingAuth,
} from './types'

/**
 * Creates a gateway wrapper function for a specific AI Gateway
 *
 * @param binding - The Cloudflare Workers AI binding (env.AI)
 * @param gatewayName - The name of your AI Gateway (created in dashboard)
 * @returns A wrapper function that configures adapters to use the gateway
 *
 * @example
 * ```typescript
 * import { anthropic } from '@tanstack/ai-anthropic'
 * import { withAiGateway } from '@harshil1712/tanstack-cf-ai-adapter'
 *
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const gateway = withAiGateway(env.AI, "my-gateway")
 *
 *     const adapter = await gateway(anthropic, {
 *       apiKey: env.ANTHROPIC_API_KEY
 *     })
 *
 *     const ai = new AI({ adapters: { anthropic: adapter } })
 *   }
 * }
 * ```
 */
export function withAiGateway(binding: AIBinding, gatewayName: string) {
  const gatewayInstance = binding.gateway(gatewayName)

  /**
   * Wraps an adapter factory to route requests through AI Gateway
   *
   * @param createAdapter - Function that creates the adapter (e.g., anthropic, openai)
   * @param config - Gateway configuration including auth and features
   * @returns Promise<Adapter> - Gateway-enabled adapter
   *
   * @example
   * ```typescript
   * // Standard auth
   * const adapter = await gateway(anthropic, {
   *   apiKey: env.ANTHROPIC_API_KEY
   * })
   *
   * // BYOK
   * const adapter = await gateway(anthropic, {
   *   storedKey: "ANTHROPIC_KEY_1",
   *   cfToken: env.CF_API_TOKEN
   * })
   *
   * // Unified Billing
   * const adapter = await gateway(anthropic, {
   *   unifiedBilling: true,
   *   cfToken: env.CF_API_TOKEN
   * })
   * ```
   */
  return async function <TAdapter extends AIAdapter>(
    createAdapter: AdapterFactory<TAdapter>,
    config: AuthConfig | GatewayAdapterConfig,
  ): Promise<TAdapter> {
    // Normalize config to GatewayAdapterConfig
    const fullConfig: GatewayAdapterConfig = isAuthConfig(config)
      ? { auth: config }
      : config

    // Detect provider from adapter factory
    const provider = detectProvider(createAdapter)

    // Get gateway URL for this provider
    let gatewayUrl: string
    try {
      gatewayUrl = await gatewayInstance.getUrl(provider)
    } catch (error) {
      throw new Error(
        `Failed to get AI Gateway URL for provider "${provider}". ` +
          `Make sure the gateway "${gatewayName}" exists in your Cloudflare account and supports this provider. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    // Create adapter with gateway URL injected
    return createAdapterWithGateway(
      createAdapter,
      gatewayUrl,
      fullConfig,
      provider,
    )
  }
}

/**
 * Type for adapter factory functions
 */
type AdapterFactory<T extends AIAdapter> = (config: any) => T

/**
 * Detects the provider name from an adapter factory
 * Uses the function name to avoid instantiating adapters
 */
function detectProvider<T extends AIAdapter>(
  createAdapter: AdapterFactory<T>,
): string {
  // Get the function name (e.g., "anthropic", "openai")
  const functionName = createAdapter.name.toLowerCase()

  // Direct match in provider mapping
  if (functionName in PROVIDER_MAPPING) {
    return PROVIDER_MAPPING[functionName]
  }

  // Try to find a partial match
  // e.g., "createAnthropicAdapter" -> "anthropic"
  for (const [key, value] of Object.entries(PROVIDER_MAPPING)) {
    if (functionName.includes(key)) {
      return value
    }
  }

  // If no match found, throw helpful error
  throw new Error(
    `Unable to detect provider from function name: ${functionName}. ` +
      `Supported providers: ${Object.keys(PROVIDER_MAPPING).join(', ')}. ` +
      `Make sure you're using a standard TanStack AI adapter factory.`,
  )
}

/**
 * Creates an adapter with the gateway URL injected
 */
function createAdapterWithGateway<T extends AIAdapter>(
  createAdapter: AdapterFactory<T>,
  gatewayUrl: string,
  config: GatewayAdapterConfig,
  provider: string,
): T {
  const { auth, providerConfig = {} } = config

  // LIMITATION: Gateway features (cache, metadata, logging) are accepted in config
  // but not yet implemented. These need to be passed as HTTP headers per-request:
  // - cf-aig-cache-ttl: config.cache?.ttl
  // - cf-aig-skip-cache: config.cache?.skipCache
  // - cf-aig-metadata: JSON.stringify(config.metadata)
  // - cf-aig-skip-logging: config.logging?.skipLogging
  // This requires custom fetch handler or adapter wrapping (future enhancement)

  // Build the configuration for the adapter
  const adapterConfig: any = {
    ...providerConfig,
    baseURL: gatewayUrl,
  }

  // Handle authentication based on mode
  if (isStandardAuth(auth)) {
    // Standard mode: pass provider API key
    adapterConfig.apiKey = auth.apiKey
  } else if (isBYOKAuth(auth)) {
    // BYOK mode: use stored key reference
    // LIMITATION: This is incomplete and will not work yet
    // TODO: Needs custom fetch handler to add cf-aig-authorization header:
    //   headers: { 'cf-aig-authorization': `Bearer ${auth.cfToken}` }
    // The stored key should be referenced in the header, not passed as apiKey
    adapterConfig.apiKey = auth.storedKey
  } else if (isUnifiedBillingAuth(auth)) {
    // Unified billing mode: use Cloudflare token
    // LIMITATION: This is incomplete and will not work yet
    // TODO: Requires custom fetch handler to:
    //   1. Add cf-aig-authorization header: `Bearer ${auth.cfToken}`
    //   2. Possibly use /compat endpoint or handle differently per provider
    adapterConfig.apiKey = auth.cfToken
  }

  // Create the adapter with gateway configuration
  try {
    return createAdapter(adapterConfig)
  } catch (error) {
    throw new Error(
      `Failed to create ${provider} adapter with gateway: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Type guard to check if config is just auth config or full config
 * If the config has an 'auth' property, it's a GatewayAdapterConfig
 * Otherwise, check if it has auth properties directly (AuthConfig)
 */
function isAuthConfig(
  config: AuthConfig | GatewayAdapterConfig,
): config is AuthConfig {
  // If it has an 'auth' property, it's a GatewayAdapterConfig
  if ('auth' in config) {
    return false
  }

  // Check if it has auth properties directly
  return (
    'apiKey' in config ||
    'storedKey' in config ||
    ('unifiedBilling' in config && config.unifiedBilling === true)
  )
}

/**
 * Helper function to get gateway URL directly (for advanced use cases)
 *
 * @param binding - The Cloudflare Workers AI binding
 * @param gatewayName - The name of your AI Gateway
 * @param provider - The provider identifier (e.g., 'openai', 'anthropic')
 * @returns Promise<string> - The gateway URL
 *
 * @example
 * ```typescript
 * const url = await getGatewayUrl(env.AI, "my-gateway", "openai")
 * // url: https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/openai
 * ```
 */
export async function getGatewayUrl(
  binding: AIBinding,
  gatewayName: string,
  provider: string,
): Promise<string> {
  return binding.gateway(gatewayName).getUrl(provider)
}
