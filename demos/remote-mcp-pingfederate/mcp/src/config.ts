import type { JWTPayload } from 'jose';

/**
 * External cloudflare resources (bindings) available to the worker at runtime.
 */
export type Env = {
  MCP_OBJECT: DurableObjectNamespace;
  PING_FEDERATE_ISSUER: string;
  MCP_SERVER_IDENTIFIER: string;
  MCP_SERVER_CLIENT_ID: string;
  MCP_SERVER_CLIENT_SECRET: string;
  API_URL: string;
};

/**
 * The authenticated context injected by the middleware and accessible within the
 * durable obect (mcp agent base class) as `this.props`.
 */
export type Props = {
  subjectClaims: JWTPayload;
  subjectToken: string;
};

/**
 * Scopes advertised by the MCP server, including required OIDC identity scopes and all resource access scopes.
 */
export const MCP_SERVER_SCOPES = [
  'openid',
  'profile',
  'todo_api:read',
  'todo_api:write',
];

/**
 * Maximum resource scopes the MCP server is allowed to delegate. Used to throttle the subject token during token exchange.
 */
export const API_ALLOWABLE_SCOPES = [
  'todo_api:read',
  'todo_api:write',
];
