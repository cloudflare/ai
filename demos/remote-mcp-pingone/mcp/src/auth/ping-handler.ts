import { Context } from 'hono';
import * as oauth from 'oauth4webapi';
import {
  generateCSRFProtection,
  validateOAuthState,
  validateCSRFToken,
  isClientApproved,
  addApprovedClient,
  renderApprovalDialog,
  createOAuthState,
  bindStateToSession,
  OAuthError,
} from './workers-oauth-utils';
import {
  generatePkceAndNonce,
  recoverAuthRequestFromForm,
  redirectToPingOne,
  initPingOneOidcClient,
  fetchPingOneTokenSet,
  fetchPingOneUserClaims,
} from './ping-utils';
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { ExtendedAuthRequest } from './ping-types';
import type { Env } from '../config';

/**
 * GET '/authorize' : OAuth entry point for incoming MCP Clients. Either displays
 * a Cloudflare consent dialog or redirects to PingOne.
 *
 * @param c - Hono context
 * @returns A 200 consent dialog render or a 302 PingOne redirect
 */
export const handleAuthorize = async (c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) => {
  try {
    const mcpClientAuthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

    // Validate client ID in Cloudflare KV.
    const clientId = mcpClientAuthReq.clientId;
    if (!clientId) throw new OAuthError('invalid_request', 'Missing client_id.', 400);
    const client = await c.env.OAUTH_PROVIDER.lookupClient(clientId);
    if (!client) throw new OAuthError('invalid_request', 'Client ID not registered in KV.', 400);

    // Check cookie for prior consent. If found, redirect to PingOne.
    const isClientApprovedCloudflare = await isClientApproved(c.req.raw, clientId, c.env.COOKIE_ENCRYPTION_KEY);
    if (isClientApprovedCloudflare) {
      // Generate single-use OAuth state for upcoming redirect.
      const pkceAndNonce = await generatePkceAndNonce();
      const extendedRequest: ExtendedAuthRequest = {...mcpClientAuthReq, pkceAndNonce };
      // Store single-use OAuth State in KV and bind single-use state token to cookie.
      const { stateToken } = await createOAuthState(extendedRequest, c.env.OAUTH_KV);
      const { setCookie: stateCookie } = await bindStateToSession(stateToken);
      return redirectToPingOne(c.env, extendedRequest, c.req.raw.url, stateToken, stateCookie);
    };

    // Else, render Cloudflare consent dialog with CSRF protection.
    const { token: csrfToken, setCookie: csrfCookie } = generateCSRFProtection();
    return renderApprovalDialog(c.req.raw, {
      client,
      csrfToken,
      server: {
        name: 'Cloudflare MCP Authorization Server',
        description: 'Secure authorization service that manages MCP clients and delegates authentication to PingOne.',
      },
      setCookie: csrfCookie,
      state: { oauthReqInfo: mcpClientAuthReq },
    });

  } catch (error: any) {
    console.error('GET /authorize error:', error);
    return (error instanceof OAuthError) ? error.toResponse() : c.text('Internal server error.', 500);
  };
};

/**
 * POST '/authorize' : Cloudflare consent dialog approval. Validates the
 * CSRF token, sets a long-term consent cookie, and redirects to PingOne.
 *
 * @param c - Hono context
 * @returns 302 redirect to PingOne
 */
export const handleConsentApproval = async (c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) => {
  try {
    const formData = await c.req.raw.formData();
    validateCSRFToken(formData, c.req.raw);

    // Extract original request embedded in form and verify client ID.
    const mcpClientAuthReq = recoverAuthRequestFromForm(formData);
    const client = await c.env.OAUTH_PROVIDER.lookupClient(mcpClientAuthReq.clientId);
    if (!client) throw new OAuthError('invalid_request', 'Client ID not registered in KV.', 400);

    // Generate single-use OAuth state for upcoming redirect.
    const pkceAndNonce = await generatePkceAndNonce();
    const extendedRequest: ExtendedAuthRequest = {...mcpClientAuthReq, pkceAndNonce };

    // Store single-use OAuth State in KV and bind single-use state token to cookie.
    const { stateToken } = await createOAuthState(extendedRequest, c.env.OAUTH_KV);
    const { setCookie: stateCookie } = await bindStateToSession(stateToken);

    // Bind consent-approval to cookie and redirect to PingOne.
    const consentCookie = await addApprovedClient(c.req.raw, mcpClientAuthReq.clientId, c.env.COOKIE_ENCRYPTION_KEY);
    return redirectToPingOne(c.env, extendedRequest, c.req.raw.url, stateToken, stateCookie, consentCookie);

  } catch (error: any) {
    console.error('POST /authorize error:', error);
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
