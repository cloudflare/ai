import { env } from 'cloudflare:workers';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HTTPException } from 'hono/http-exception';
import type { JWTVerifyResult } from 'jose';
import type { Env, APIVariables } from './config';

const validatePingOneToken = async (token: string): Promise<JWTVerifyResult> => {
  const jwksUrl = new URL(env.PINGONE_ISSUER + '/jwks');
  const jwksFetcher = createRemoteJWKSet(jwksUrl);
  try {
    return await jwtVerify(token, jwksFetcher, {
      issuer: env.PINGONE_ISSUER,
      audience: env.PINGONE_AUDIENCE,
      algorithms: ['RS256']
    });
  } catch (e) {
    console.error('JWT verification failed with jose error:', e);
    throw e;
  };
};

export const requireJwtMiddleware = createMiddleware<{Bindings: Env, Variables: APIVariables}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Unauthorized: Bearer token missing' });
  };
  const token = authHeader.split(' ')[1];
  try {
    const verificationResult = await validatePingOneToken(token);
    c.set('USER_ID', verificationResult.payload.sub as string);
    c.set('USER_SCOPES', verificationResult.payload.scope as string);
  } catch (error) {
    console.error('JWT Verification Failed:', error);
    throw new HTTPException(401, { message: 'Unauthorized: Token invalid or expired' });
  };
  await next();
});
