import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { TodoMcpServer } from './mcp'; 
import { authenticationMiddleware } from './auth'; 
import { type Env, MCP_SERVER_SCOPES } from './config';

/**
 * Durable Object Export - Session State Management
 *
 * This export identifies the TodoMCPServer (an McpAgent base class) as the stateful backing logic for
 * the durable object binding. The cloudflare runtime uses this to instantiate a unique, isolated instance
 * per MCP session, ensuring state continuity and persistence across the worker's stateless HTTP requests.
 */
export { TodoMcpServer };

/**
 * Worker Export - Metadata & MCP Router (HTTP Interface)
 *
 * Hono router, which serves as the public entry point for all incoming HTTP requests.
 * Manages MCP client discovery and authenticated MCP communication.
 *   - Metadata Server: Serves well-known documents to guide MCP clients through the registration/authorization process
 *   - Authentication Gate: Validates the MCP client's subject token (user token) before routing.
 *   - Stateful Router: Connects the authenticated request to the correct TodoMcpServer durable object instance.
 */
export default new Hono<{ Bindings: Env }>()
  .use(cors())

  // Protected Resource Metadata - MCP Spec
  // Advertises this MCP server's protected resource details (URL, scopes, authority) and
  // directs MCP clients to the external authorization server (Ping Federate).
  .get('/.well-known/oauth-protected-resource', (c) => {
    return c.json({
      resource: c.env.MCP_SERVER_IDENTIFIER.replace(/\/$/, ''),
      authorization_servers: [c.env.PING_FEDERATE_ISSUER],
      scopes_supported: MCP_SERVER_SCOPES,
    });
  })

  // Authorization Server Metadata - RFC 8414
  // Advertises this MCP server's necessary endpoints for MCP clients to perform DCR
  // and initiate the correct authorization code flow (OIDC login).
  .get('/.well-known/oauth-authorization-server', async (c) => {
    const response = await fetch(`${c.env.PING_FEDERATE_ISSUER}/.well-known/openid-configuration`);
    const pingFedConfig = await response.json() as any;
    return c.json({
      issuer: c.env.PING_FEDERATE_ISSUER,
      jwks_uri: pingFedConfig.jwks_uri,
      scopes_supported: pingFedConfig.scopes_supported,
      registration_endpoint: pingFedConfig.registration_endpoint,
      authorization_endpoint: pingFedConfig.authorization_endpoint,
      token_endpoint: pingFedConfig.token_endpoint,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
    });
  })

  // Applies the auth middleware to validate the MCP client's subject token (the user token),
  // and then injects the claims/token into the stateful durable object execution context.
  .use('/mcp', authenticationMiddleware)

  // Routes the authenticated request to the correct durable object (`TodoMcpServer`).
  // This enables persistent MCP communication via Streamable HTTP Transport
  .route('/mcp', new Hono().mount('/', TodoMcpServer.serve('/mcp').fetch));
