import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HTTPException } from 'hono/http-exception';
import type { JWTPayload } from 'jose';
import type { Env, APIVariables } from './config';

/**
 * Checks token signature, issuer, audience, and expiry using the issuer's JWKS.
 *
 * @param env - The worker's environment bindings
 * @param token - The JWT string (access token) to validate
 * @returns Promise that resolves to JWTPayload
 * @throws error if signature, issuer, audience, or expiry is invalid
 */
const validatePingFederateToken = async (env: Env, token: string): Promise<JWTPayload> => {
  const jwksUrl = new URL(env.API_ISSUER + '/pf/JWKS');
  const jwksFetcher = createRemoteJWKSet(jwksUrl);
  const { payload } = await jwtVerify(token, jwksFetcher, {
    issuer: env.API_ISSUER,
    audience: env.API_AUDIENCE,
    algorithms: ['RS256'],
  });
  return payload;
};

/**
 * Hono middleware to mandate authenticated access to the API.
 * - When permitted: inject user ID & scopes into the hono request context.
 * - When not permitted: reject with a 401.
 *
 * @param c - Hono context
 * @param next - The next hono middleware function
 * @returns Promise that resolves to the next middleware call
 */
export const authenticationMiddleware = createMiddleware<{Bindings: Env, Variables: APIVariables}>(async (c, next) => {
  try {
    const token = c.req.header('Authorization')!.substring(7);
    const payload = await validatePingFederateToken(c.env, token);
    c.set('USER_ID', payload.sub as string);
    c.set('USER_SCOPES', payload.scope as string[]);
  } catch (error) {
    console.error('JWT Verification Failed:', error);
    throw new HTTPException(401, { message: 'Unauthorized: Token invalid or expired' });
  };
  await next();
});

/**
 * Factory that returns a hono middleware enforcing the presence of the
 * `requiredScope` in the hono request context.
 */
export const requireScopeMiddleware = (requiredScope: string) => {
  return createMiddleware<{Bindings: Env, Variables: APIVariables}>(async (c, next) => {
    const userScopes = c.get('USER_SCOPES');
    if (!userScopes) {
      console.error('Scope check failed: USER_SCOPES not available.');
      throw new HTTPException(403, { message: 'Forbidden: Missing authentication context' });
    };
    if (!userScopes.includes(requiredScope)) {
      console.warn(`Access Denied: Missing required scope: ${requiredScope}.`);
      throw new HTTPException(403, { message: `Forbidden: Missing required scope: ${requiredScope}` });
    };
    await next();
  });
};