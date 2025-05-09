import { Hono } from "hono";
import { cors } from "hono/cors";
import { OAuthMetadata } from "../schemas/oauth.js";
import { allowedMethods } from "../middleware/allowedMethods.js";
import { DescopeMcpProvider } from "../provider.js";

export function metadataHandler(provider: DescopeMcpProvider): Hono {
  const baseUrl = provider.baseUrl;
  const projectId = provider.projectId;
  const issuer = new URL(projectId, baseUrl);

  const authorization_endpoint = new URL("/authorize", provider.serverUrl).href;
  const token_endpoint = provider.descopeOAuthEndpoints.token.href;
  const registration_endpoint = provider.options
    .dynamicClientRegistrationOptions?.isDisabled
    ? undefined
    : new URL("/register", provider.serverUrl).href;
  const revocation_endpoint = provider.descopeOAuthEndpoints.revocation.href;

  const scopes_supported_attribute =
    provider.options.dynamicClientRegistrationOptions?.attributeScopes?.map(
      (scope) => scope.name,
    ) ?? [];
  const scopes_support_permission =
    provider.options.dynamicClientRegistrationOptions?.permissionScopes?.map(
      (scope) => scope.name,
    ) ?? [];
  const scopes_supported = [
    ...scopes_supported_attribute,
    ...scopes_support_permission,
  ];

  const metadata: OAuthMetadata & { userinfo_endpoint: string } = {
    issuer: issuer.href,
    service_documentation: provider.options.serviceDocumentationUrl,

    authorization_endpoint,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],

    token_endpoint,
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    grant_types_supported: ["authorization_code", "refresh_token"],

    revocation_endpoint,
    revocation_endpoint_auth_methods_supported: revocation_endpoint
      ? ["client_secret_post"]
      : undefined,

    registration_endpoint,

    scopes_supported: ["openid", ...scopes_supported],

    userinfo_endpoint: provider.descopeOAuthEndpoints.userinfo.href,
  };

  const app = new Hono();

  // Configure CORS to allow any origin, to make accessible to web-based MCP clients
  app.use("*", cors());

  // Apply allowed methods middleware
  app.use("*", allowedMethods(["GET"]));

  // Handle GET request for metadata
  app.get("/", (c) => {
    return c.json(metadata, 200);
  });

  return app;
}
