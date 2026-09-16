import { Hono } from 'hono';
import { OAuthProvider, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { TodoMcpServer } from './mcp';
import { handleAuthorize, handlePingOneCallback, handleConsentApproval } from './auth/ping-handler';
import type { Env } from './config';

/**
 * Durable Object Export - Session State Management
 *
 * This export identifies the TodoMCPServer (an McpAgent base class) as the stateful backing logic for
 * the durable object binding. The cloudflare runtime uses this to instantiate a unique, isolated instance
 * per MCP session, ensuring state continuity and persistence across the worker's stateless HTTP requests.
 */
export { TodoMcpServer };

/**
 * Worker Export - OAuth Server & MCP Gateway (HTTP Interface)
 *
 * Cloudflare Workers OAuth Provider, which serves as the public entry point for all incoming HTTP requests.
 * Manages the OAuth authorization and MCP communication flow.
 *   - OAuth Server: Implements the OAuth endpoints for MCP clients.
 *   - OIDC Client: Delegates user authentication to PingOne with a custom hono router.
 *   - Stateful Router: Connects the authenticated request to the correct TodoMCPServer durable object instance.
 */
export default new OAuthProvider({
  authorizeEndpoint: '/authorize',
  clientRegistrationEndpoint: '/register',
  tokenEndpoint: '/token',
  defaultHandler: new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>()
    .get('/authorize', handleAuthorize)
    .post('/authorize', handleConsentApproval)
    .get('/callback', handlePingOneCallback) as any,
  apiHandlers: {
    "/sse": TodoMcpServer.serveSSE("/sse"), // Legacy SSE transport
    '/mcp': TodoMcpServer.serve('/mcp'), // Streamable HTTP transport
	},
});
