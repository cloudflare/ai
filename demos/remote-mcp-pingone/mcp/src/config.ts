import { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

/**
 * External resources (bindings) available to the worker at runtime.
 */
export type Env = {
  MCP_OBJECT: DurableObjectNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  OAUTH_KV: KVNamespace;
  COOKIE_ENCRYPTION_KEY: string;
  PINGONE_ISSUER: string;
  MCP_SERVER_CLIENT_ID: string;
  MCP_SERVER_CLIENT_SECRET: string;
  API_IDENTIFIER: string;
  API_URL: string;
};

/**
 * The authenticated context injected by the middleware and accessible within the
 * durable obect (mcp agent base class) as `this.props`.
 */
export type Props = {
  subjectToken: string;
};

/**
 * Scopes the MCP server will request from PingOne.
 */
export const MCP_SERVER_SCOPES = [
  'openid',
  'profile',
  'todo_api:read',
  'todo_api:write',
];
