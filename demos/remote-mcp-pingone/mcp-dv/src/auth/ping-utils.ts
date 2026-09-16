import * as oauth from 'oauth4webapi';
import { OAuthError } from './workers-oauth-utils';
import type {
  PkceAndNonce,
  ExtendedAuthRequest,
  PingOneOidcConfig,
  PingOneTokenSet,
  PingOneUserClaims
} from './ping-types';
import { type Env,  MCP_SERVER_SCOPES} from '../config';

/**
 * Generate PKCE components (`code_verifier`, `code_challenge`) and `nonce`.
 */
export const generatePkceAndNonce = async (): Promise<PkceAndNonce> => {
  const code_verifier = oauth.generateRandomCodeVerifier();
  const code_challenge = await oauth.calculatePKCECodeChallenge(code_verifier);
  const nonce = oauth.generateRandomNonce();
  return {code_verifier, code_challenge, nonce};
};

/**
 * Initialize OIDC client config by performing OIDC discovery and setting up client credentials.
 * @param env - Worker environment bindings
 */
export const initPingOneOidcClient = async (env: Env): Promise<PingOneOidcConfig> => {
  // OIDC Discovery.
  const as = await oauth
    .discoveryRequest(new URL(env.PINGONE_ISSUER), { algorithm: 'oidc' })
    .then((response) => oauth.processDiscoveryResponse(new URL(env.PINGONE_ISSUER), response));

  // Define client and authentication method (Client Secret Basic).
  const client: oauth.Client = { client_id: env.MCP_SERVER_CLIENT_ID };
  const clientTokenCredential = oauth.ClientSecretBasic(env.MCP_SERVER_CLIENT_SECRET);
  return { as, client, clientTokenCredential };
};

/**
 * Construct PingOne DaVinci authorization URL and issue a redirect.
 *
 * @param env - Worker environment bindings
 * @param mcpClientAuthReq - Incoming authorization request from MCP client
 * @param mcpClientAuthReqUrl - Incoming authorization request URL from MCP client
 * @param stateToken - Single-use state token stored in kv
 * @param stateCookie - Single-use state cookie for the browser
 * @returns 302 redirect to PingOne
 */
export const redirectToPingOne = async (
  env: Env,
  mcpClientAuthReq: ExtendedAuthRequest,
  mcpClientAuthReqUrl: string,
  stateToken: string,
  stateCookie: string
): Promise<Response> => {
  // Construct the Authorization URL.
  const mcpServerRedirectUrl = new URL('/callback', mcpClientAuthReqUrl).href;
  const pingAuthorizeUrl = new URL(`${env.PINGONE_ISSUER}/authorize`);
  pingAuthorizeUrl.searchParams.set('response_type', 'code');
  pingAuthorizeUrl.searchParams.set('client_id', env.MCP_SERVER_CLIENT_ID);
  pingAuthorizeUrl.searchParams.set('resource', env.API_IDENTIFIER);
  pingAuthorizeUrl.searchParams.set('scope', MCP_SERVER_SCOPES.join(' '));
  pingAuthorizeUrl.searchParams.set('redirect_uri', mcpServerRedirectUrl);
  pingAuthorizeUrl.searchParams.set('state', stateToken);
  pingAuthorizeUrl.searchParams.set('code_challenge', mcpClientAuthReq.pkceAndNonce.code_challenge);
  pingAuthorizeUrl.searchParams.set('code_challenge_method', 'S256');
  pingAuthorizeUrl.searchParams.set('nonce', mcpClientAuthReq.pkceAndNonce.nonce);
  pingAuthorizeUrl.searchParams.set('acr_values', env.PINGONE_DV_POLICY_ID);
  const headers = new Headers();

  // Always append single-use state cookie.
  headers.append('Set-Cookie', stateCookie);

  // Issue the 302 redirect.
  headers.set('Location', pingAuthorizeUrl.toString());
  return new Response(null, { status: 302, headers });
};

/**
 * Complete authorization code grant by exchanging the received code for a PingOne token set.
 *
 * @param oidcConfig - Pre-fetched OIDC configuration
 * @param pingCallbackParams - URL params of incoming /callback request (with auth code)
 * @param pingCallbackUrl - URL of the incoming /callback request
 * @param originalCodeVerifier - PKCE secret from original MCP client request (from kv)
 * @param originalNonce - OIDC secret from original MCP client request (from kv)
 * @returns Promise that resolves to the PingOneTokenSet
 */
export const fetchPingOneTokenSet = async (
  oidcConfig: PingOneOidcConfig,
  pingCallbackParams: URLSearchParams,
  pingCallbackUrl: string,
  originalCodeVerifier: string,
  originalNonce: string
): Promise<PingOneTokenSet> => {
  // Token exchange POST request with original PKCE secret.
  const response = await oauth.authorizationCodeGrantRequest(
    oidcConfig.as,
    oidcConfig.client,
    oidcConfig.clientTokenCredential,
    pingCallbackParams,
    new URL('/callback', pingCallbackUrl).href,
    originalCodeVerifier
  );

  // Process and validate with original nonce secret.
  const tokenResponse = await oauth.processAuthorizationCodeResponse(
    oidcConfig.as,
    oidcConfig.client,
    response,
    { expectedNonce: originalNonce, requireIdToken: true }
  );

  // Validate signature and return the token set.
  oauth.getValidatedIdTokenClaims(tokenResponse);
  return {
    access_token: tokenResponse.access_token.trim(),
    token_type: tokenResponse.token_type,
    expires_in: tokenResponse.expires_in!,
    scope: tokenResponse.scope!,
    id_token: tokenResponse.id_token!
  };
};

/**
 * Fetch user claims from the PingOne UserInfo Endpoint.
 *
 * @param env - Worker environment bindings
 * @param access_token - PingOne access token
 * @returns Promise that resolves to the PingOneUserClaims
 */
export const fetchPingOneUserClaims = async (env: Env, access_token: string): Promise<PingOneUserClaims> => {
  const userinfoUrl = `${env.PINGONE_ISSUER}/userinfo`;
  const response = await fetch(userinfoUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new OAuthError('server error', `Error fetching user claims. ${response.statusText}.`, response.status);
  };
  return response.json();
};
