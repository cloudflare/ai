import { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { PingOneTokenSet } from './auth/ping-types';

/**
 * External resources (bindings) available to the worker at runtime.
 */
export type Env = {
  TODO_API_URL: string;
  OAUTH_PROVIDER: OAuthHelpers    // CF OAuth Provider
  OAUTH_KV: KVNamespace;          // CF KV Namespace, used by CF OAuth Provider
  COOKIE_ENCRYPTION_KEY: string;  // Signs cookie data, used by CF OAuth Provider
  PINGONE_DOMAIN: string;         // Base URL of PingOne Environment
  PINGONE_CLIENT_ID: string;      // PingOne OIDC Application ID
  PINGONE_CLIENT_SECRET: string;  // PingOne OIDC Application Secret
};

/**
 * Session data stored and managed by the CF OAuth Provider within a CF Durable Object.
 */
export type Props = {
  sub: string;
  preferred_username: string;
  given_name: string;
  family_name: string;
  email: string;
  tokenSet: PingOneTokenSet;
};
