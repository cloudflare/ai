import { Context } from 'hono';
import * as oauth from 'oauth4webapi';
import { validateOAuthState, createOAuthState, bindStateToSession, OAuthError } from './workers-oauth-utils';
import {
  generatePkceAndNonce,
  redirectToPingOne,
  initPingOneOidcClient,
  fetchPingOneTokenSet,
  fetchPingOneUserClaims,
} from './ping-utils';
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { ExtendedAuthRequest } from './ping-types';
import type { Env } from '../config';

/**
 * GET '/authorize' : OAuth entry point for incoming MCP Clients. Immedietely redirect to PingOne
 * DaVinci for authorization / authentication. This bypasses the Cloudflare consent screen (trust any
 * client to initiate a login flow, as long as their client ID is in KV) and therefore relies on the
 * DaVinci policy to handle consent. Note that the client ID will be added to KV internally by the
 * cloudflare oauth proider when the client first connects.
 *
 * @param c - Hono context
 * @returns A 302 PingOne DaVinci redirect
 */
export const handleAuthorize = async (c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) => {
  try {
    const mcpClientAuthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

    // Validate client ID in Cloudflare KV.
    const clientId = mcpClientAuthReq.clientId;
    if (!clientId) throw new OAuthError('invalid_request', 'Missing client_id.', 400);
    const client = await c.env.OAUTH_PROVIDER.lookupClient(clientId);
    if (!client) throw new OAuthError('invalid_request', 'Client ID not registered in KV.', 400);

    // Generate single-use OAuth state for upcoming redirect.
    const pkceAndNonce = await generatePkceAndNonce();
    const extendedRequest: ExtendedAuthRequest = {...mcpClientAuthReq, pkceAndNonce };

    // Store single-use OAuth State in KV and bind single-use state token to cookie.
    const { stateToken } = await createOAuthState(extendedRequest, c.env.OAUTH_KV);
    const { setCookie: stateCookie } = await bindStateToSession(stateToken);

    // Perform the redirect.
    return redirectToPingOne(c.env, extendedRequest, c.req.raw.url, stateToken, stateCookie);

  } catch (error: any) {
    console.error('GET /authorize error:', error);
    return (error instanceof OAuthError) ? error.toResponse() : c.text('Internal server error.', 500);
  };
};

/**
 * GET '/callback' : PingOne callback that completes tha authorization transaction.
 * This handler also persists the long-term session state in a CF Durable Object and
 * issues an authorization code to the MCP client.
 *
 * @param c - Hono context
 * @returns 302 redirect to MCP client with the MCP Authorization Code
 */
export const handlePingOneCallback = async (c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) => {
  try {
    // Ensure echoed single-use state exists in KV and matches the single-use cookie. Delete state from KV after.
    const stateResult = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
    const { oauthReqInfo: mcpClientAuthReq, clearCookie: clearSessionCookie } = stateResult;

    // Prepare MCP server to act as OIDC client to PingOne.
    const pkceAndNonce = (mcpClientAuthReq as ExtendedAuthRequest).pkceAndNonce;
    const oidcClient = await initPingOneOidcClient(c.env);

    // Validate authorization code and echoed state from callback against the OIDC config.
    const validatedAuthCodeAndState = oauth.validateAuthResponse(
      oidcClient.as,
      oidcClient.client,
      new URL(c.req.url),
      c.req.query("state")
    );

    // Exchange authorization code for token set and get user claims.
    const tokenSet = await fetchPingOneTokenSet(
      oidcClient,
      validatedAuthCodeAndState,
      c.req.url,
      pkceAndNonce.code_verifier,
      pkceAndNonce.nonce,
    );
    const userClaims = await fetchPingOneUserClaims(c.env, tokenSet.access_token);

    // Mint MCP authorization code and store the session in a KF Durable Object (this.props).
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: mcpClientAuthReq,
      userId: userClaims.sub,
      metadata: { label: userClaims.preferred_username },
      scope: mcpClientAuthReq.scope,
      props: {
        subjectToken: tokenSet.access_token,
      },
    });

    // Redirect back to MCP Client with MCP authorization code, instructing browser to clear single-use state cookie.
    const headers = new Headers({ Location: redirectTo });
    if (clearSessionCookie) headers.set('Set-Cookie', clearSessionCookie);
    return new Response(null, { status: 302, headers });

  } catch (error: any) {
    console.error('GET /callback error:', error);
    return (error instanceof OAuthError) ? error.toResponse() : c.text(`Internal server error.`, 500);
  };
};
