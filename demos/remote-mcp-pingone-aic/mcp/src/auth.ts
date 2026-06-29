import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { HTTPException } from 'hono/http-exception';
import type { Env, Props } from './config';

interface ClientCredentialsGrantResponse {
  access_token: string;
  scope: string;
  token_type: 'Bearer';
  expires_in: number;
};

interface TokenExchangeGrantResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  issued_token_type: 'urn:ietf:params:oauth:token-type:access_token';
  refresh_token?: string;
};

/**
 * Checks token signature, issuer, audience, and expiry using the issuer's JWKS.
 *
 * @param env - The worker's environment bindings
 * @param token - The JWT string (access token) to validate
 * @returns Promise that resolves to JWTPayload
 * @throws error if signature, issuer, audience, or expiry is invalid
 */
const validatePingAicToken = async(env: Env, token: string): Promise<JWTPayload> => {
  const jwksUrl = new URL(env.PING_AIC_ISSUER + '/connect/jwk_uri');
  const jwksFetcher = createRemoteJWKSet(jwksUrl);
  const { payload } = await jwtVerify(token, jwksFetcher, {
    issuer: env.PING_AIC_ISSUER,
    audience: env.MCP_SERVER_IDENTIFIER.replace(/\/$/, ''),
    algorithms: ['RS256'],
  });
  return payload;
};

/**
 * Hono middleware to mandate authenticated access to the MCP server.
 * - When permitted: inject user token & claims into the durable object execution context.
 * - When not permitted: reject with a 401, but include metadata so MCP client can perform discovery.
 *
 * @param c - Hono context
 * @param next - The next hono middleware function
 * @returns Promise that resolves to the next middleware call
 */
export const authenticationMiddleware = createMiddleware<{Bindings: Env, Variables: Props}>(async (c, next) => {
  try {
    const subjectToken = c.req.header('Authorization')!.substring(7);
    const subjectClaims = await validatePingAicToken(c.env, subjectToken);
    c.executionCtx.props = { subjectClaims, subjectToken } as Props;
    await next();
  } catch {
    const origin = new URL(c.req.url).origin;
    const metadataUrl = `${origin}/.well-known/oauth-protected-resource`;
    c.header('WWW-Authenticate', `Bearer error="Unauthorized", resource_metadata="${metadataUrl}"`);
    throw new HTTPException(401, { message: 'Missing or invalid access token' });
  };
});

/**
 * Get the actor token for the MCP Server using the client credentials grant.
 *
 * This token represents the identity of the MCP server (the delegate) and is required
 * for the delegation token exchange.
 *
 * @param env - The worker's environment bindings
 * @param actorScopes - Filtered list of scopes the actor (MCP server) is permitted to carry
 * @returns Promise that resolves to the actor token
 */
export const getActorToken = async (env: Env, actorScopes: Array<string>): Promise<string> => {
  const grantResponse = await fetch(`${env.PING_AIC_ISSUER}/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${env.MCP_SERVER_CLIENT_ID}:${env.MCP_SERVER_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      'grant_type': 'client_credentials',
      'scope': actorScopes.join(' '),
    }).toString(),
  });
  if (!grantResponse.ok) {
    console.error('Actor Token (Client Credentials) failed:', await grantResponse.text());
    throw new Error(`Failed to get Actor Token. ${grantResponse.status} ${grantResponse.statusText}`);
  };
  const result = await grantResponse.json() as ClientCredentialsGrantResponse;
  return result.access_token;
};

/**
 * Performs the OAuth 2.0 Token Exchange (Delegation Grant) to acquire the final API token.
 *
 * Swap the end user token (subject token) and MCP server token (actor token) for a new token.
 * The new token will be audienced for the target API amd include the 'act' claim, identifying
 * the MCP server as the delegate.
 * @see https://docs.pingidentity.com/pingoneaic/latest/am-oauth2/token-exchange.html#token-exchange-delegation
 *
 * @param env - The worker's environment bindings
 * @param subjectToken - The end user initial access token (from the MCP client)
 * @param actorToken - The MCP server access token
 * @param actorScopes - Filtered list of scopes the actor (MCP server) is permitted to carry
 * @returns Promise that resolves to the delegate API token
 */
export const exchangeForTodoApiToken = async (
  env: Env,
  subjectToken: string,
  actorToken: string,
  actorScopes: Array<string>
): Promise<string> => {
  const response = await fetch(`${env.PING_AIC_ISSUER}/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${env.MCP_SERVER_CLIENT_ID}:${env.MCP_SERVER_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      'grant_type': 'urn:ietf:params:oauth:grant-type:token-exchange',
      'subject_token': subjectToken,
      'subject_token_type': 'urn:ietf:params:oauth:token-type:access_token',
      'actor_token': actorToken,
      'actor_token_type': 'urn:ietf:params:oauth:token-type:access_token',
      'requested_token_type': 'urn:ietf:params:oauth:token-type:access_token',
      'scope': actorScopes.join(' '),
      'resource': env.API_URL.replace(/\/$/, ''),
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Failed to exchange token. ${response.status} ${response.statusText}`);
  };
  const apiTokenSet = await response.json() as TokenExchangeGrantResponse;
  return apiTokenSet.access_token;
};
