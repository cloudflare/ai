/**
 * Anthropic Gateway Adapter
 *
 * Extends TanStack AI's Anthropic adapter to route requests through
 * Cloudflare AI Gateway with support for:
 * - Standard authentication (provider API keys)
 * - BYOK (Bring Your Own Keys - keys stored in CF)
 * - Unified Billing (Cloudflare handles billing)
 */

import { Anthropic as AnthropicAdapter } from "@tanstack/ai-anthropic";
import Anthropic_SDK from "@anthropic-ai/sdk";
import type { AIBinding } from "../types";
import { createGatewayFetch } from "../utils/fetch-interceptor";

/**
 * Configuration types for Anthropic Gateway adapter
 * Mode is auto-detected based on which properties are present
 */

// Standard: Just API key
export interface StandardAuthConfig {
  apiKey: string;
}

// BYOK: Key stored in dashboard, only need CF token for gateway auth
export interface BYOKAuthConfig {
  byok: true;
  cfToken: string;
}

// Unified Billing: CF token only
export interface UnifiedBillingAuthConfig {
  unifiedBilling: true;
  cfToken: string;
}

export type AnthropicGatewayAuthConfig =
  | StandardAuthConfig
  | BYOKAuthConfig
  | UnifiedBillingAuthConfig;

/**
 * Type guards for auto-detection
 */
export function isStandardAuth(
  config: AnthropicGatewayAuthConfig
): config is StandardAuthConfig {
  return "apiKey" in config;
}

export function isBYOKAuth(
  config: AnthropicGatewayAuthConfig
): config is BYOKAuthConfig {
  return "byok" in config && config.byok === true;
}

export function isUnifiedBillingAuth(
  config: AnthropicGatewayAuthConfig
): config is UnifiedBillingAuthConfig {
  return "unifiedBilling" in config && config.unifiedBilling === true;
}

/**
 * Anthropic Gateway Adapter
 * Extends TanStack AI's Anthropic adapter with AI Gateway support
 */
export class AnthropicGatewayAdapter extends AnthropicAdapter {
  constructor(config: AnthropicGatewayAuthConfig & { gatewayUrl: string }) {
    let sdkConfig: ConstructorParameters<typeof Anthropic_SDK>[0];

    // Auto-detect mode and configure SDK accordingly
    if (isStandardAuth(config)) {
      // Standard authentication - just pass API key and gateway URL
      sdkConfig = {
        apiKey: config.apiKey,
        baseURL: config.gatewayUrl,
      };
      super({ apiKey: config.apiKey });
    } else if (isBYOKAuth(config)) {
      // BYOK - stored key in dashboard, authenticate with CF token
      // Use proper fetch interceptor to ensure Authorization header is never sent
      const gatewayFetch = createGatewayFetch({
        cfToken: config.cfToken,
        mode: "byok",
      });

      sdkConfig = {
        apiKey: "unused", // SDK requires apiKey, but our fetch intercepts the request
        baseURL: config.gatewayUrl,
        fetch: gatewayFetch,
      };
      super({ apiKey: "unused" });
    } else if (isUnifiedBillingAuth(config)) {
      // Unified Billing - Cloudflare handles provider auth and billing
      // Use proper fetch interceptor to ensure Authorization header is never sent
      const gatewayFetch = createGatewayFetch({
        cfToken: config.cfToken,
        mode: "unified-billing",
      });

      sdkConfig = {
        // apiKey: 'unused', // SDK requires apiKey, but our fetch intercepts the request
        baseURL: config.gatewayUrl,
        fetch: gatewayFetch,
      };
      super({ apiKey: "unused" });
    } else {
      throw new Error(
        "Invalid Anthropic gateway config. Must provide either: " +
          "(1) apiKey for standard auth, " +
          "(2) byok: true + cfToken for BYOK, or " +
          "(3) unifiedBilling: true + cfToken for unified billing"
      );
    }

    // Replace the internal Anthropic SDK client with our gateway-configured one
    // @ts-ignore - accessing private property
    this.client = new Anthropic_SDK(sdkConfig);
  }
}

/**
 * Factory function to create Anthropic gateway adapter
 *
 * @param binding - Cloudflare AI Gateway binding (env.AI)
 * @param gatewayName - Name of your AI Gateway
 * @param config - Auth configuration (mode auto-detected)
 * @returns Anthropic adapter configured for AI Gateway
 *
 * @example Standard authentication
 * ```typescript
 * const adapter = await anthropicGateway(env.AI, 'my-gateway', {
 *   apiKey: env.ANTHROPIC_API_KEY
 * })
 * ```
 *
 * @example BYOK (Bring Your Own Keys)
 * ```typescript
 * const adapter = await anthropicGateway(env.AI, 'my-gateway', {
 *   byok: true,
 *   cfToken: env.CF_API_TOKEN
 * })
 * ```
 *
 * @example Unified Billing
 * ```typescript
 * const adapter = await anthropicGateway(env.AI, 'my-gateway', {
 *   unifiedBilling: true,
 *   cfToken: env.CF_API_TOKEN
 * })
 * ```
 */
export async function anthropicGateway(
  binding: AIBinding,
  gatewayName: string,
  config: AnthropicGatewayAuthConfig
): Promise<AnthropicGatewayAdapter> {
  // Get gateway URL for Anthropic provider
  const gatewayUrl = await binding.gateway(gatewayName).getUrl("anthropic");

  // Create and return gateway-configured adapter
  return new AnthropicGatewayAdapter({
    ...config,
    gatewayUrl,
  });
}
