import { z } from "zod";

/**
 * Base scope definition with common properties.
 */
export const ScopeSchema = z.object({
  /** Name of the scope */
  name: z.string(),

  /** Optional description of the scope */
  description: z.string().optional(),

  /** Whether this scope is required */
  required: z.boolean().optional(),
});

/**
 * Scope definition for attribute access.
 */
export const AttributeScopeSchema = ScopeSchema.extend({
  /** List of attributes that can be accessed */
  attributes: z.array(z.string()),
});

/**
 * Scope definition for permission access.
 */
export const PermissionScopeSchema = ScopeSchema.extend({
  /** List of roles that can be accessed */
  roles: z.array(z.string()).optional(),
});

/**
 * Options for verifying access tokens.
 */
export const VerifyTokenOptionsSchema = z.object({
  /** Scopes to verify against the token */
  requiredScopes: z.array(z.string()).optional(),

  /** Audience(s) to verify against the token */
  audience: z.array(z.string()).optional(),

  /** Key to use for token verification */
  key: z.union([z.any(), z.string()]).optional(),
});

/**
 * Configuration for dynamic client registration functionality.
 */
export const DynamicClientRegistrationOptionsSchema = z.object({
  /** Whether dynamic client registration is enabled */
  isDisabled: z.boolean().optional(),

  /** URL for the authentication flow */
  authPageUrl: z.string().optional(),

  /** Scopes for attribute access */
  attributeScopes: z.array(AttributeScopeSchema).optional(),

  /** Scopes for permission access */
  permissionScopes: z.array(PermissionScopeSchema).optional(),
});

/**
 * Configuration options for the Descope MCP SDK.
 */
export const DescopeMcpProviderOptionsSchema = z.object({
  /** The Descope project ID */
  projectId: z.string().optional(),

  /** The Descope management key for administrative operations */
  managementKey: z.string().optional(),

  /** Descope endpoints are usually hosted on a different subdomain or domain
   * versus the MCP Server itself. This MCP Server URL allows us to
   * handle Dynamic Client Registration on a local server path.
   *  **/
  serverUrl: z.string().optional(),

  /** The Descope base URL if a custom domain is set */
  baseUrl: z.string().optional(),

  /** Options for dynamic client registration */
  dynamicClientRegistrationOptions:
    DynamicClientRegistrationOptionsSchema.optional(),
  /** Options for token verification */

  verifyTokenOptions: VerifyTokenOptionsSchema.optional(),

  /** Human readable documentation */
  serviceDocumentationUrl: z.string().optional(),
});

export type Scope = z.infer<typeof ScopeSchema>;
export type AttributeScope = z.infer<typeof AttributeScopeSchema>;
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;
export type VerifyTokenOptions = z.infer<typeof VerifyTokenOptionsSchema>;
export type DynamicClientRegistrationOptions = z.infer<
  typeof DynamicClientRegistrationOptionsSchema
>;
export type DescopeMcpProviderOptions = z.infer<
  typeof DescopeMcpProviderOptionsSchema
>;
