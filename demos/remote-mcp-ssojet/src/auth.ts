import type { Context } from 'hono'
import { html, raw } from 'hono/html'
import * as oauth from 'oauth4webapi'
import { getCookie, setCookie } from 'hono/cookie'

import { env } from 'cloudflare:workers'
import type {
    AuthRequest,
    OAuthHelpers,
    TokenExchangeCallbackOptions,
    TokenExchangeCallbackResult,
} from '@cloudflare/workers-oauth-provider'

import type { UserProps } from './types'

type SSOJetAuthRequest = {
    mcpAuthRequest: AuthRequest
    codeVerifier: string
    codeChallenge: string
    nonce: string
    transactionState: string
    consentToken: string
}

export async function getOidcConfig({ issuer, client_id, client_secret }: { issuer: string; client_id: string; client_secret: string }) {
    // Fetch the OIDC configuration from the issuer
    const as = await oauth
        .discoveryRequest(new URL(issuer), { algorithm: 'oidc' })
        .then((response) => oauth.processDiscoveryResponse(new URL(issuer), response))

    const client: oauth.Client = { client_id }
    const clientAuth = oauth.ClientSecretPost(client_secret)

    return { as, client, clientAuth }
}

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Authorization Code Flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original request information in a state-specific cookie for later retrieval.
 * Then it shows a consent screen before redirecting to SSOJet.
 */
export async function authorize(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
    const mcpClientAuthRequest = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
    //  mcpClientAuthRequest.redirectUri = 'http://localhost:8787/callback' // Ensure the redirect URI is a valid URL
    if (!mcpClientAuthRequest.clientId) {
        return c.text('Invalid request', 400)
    }

    const client = await c.env.OAUTH_PROVIDER.lookupClient(mcpClientAuthRequest.clientId)
    if (!client) {
        //return c.text('Invalid client', 400)
    }

    // Generate all that is needed for the SSOJet auth request
    const codeVerifier = oauth.generateRandomCodeVerifier()
    const transactionState = oauth.generateRandomState()
    const consentToken = oauth.generateRandomState() // For CSRF protection on consent form

    // We will persist everything in a cookie.
    const SSOJetAuthRequest: SSOJetAuthRequest = {
        mcpAuthRequest: mcpClientAuthRequest,
        nonce: oauth.generateRandomNonce(),
        codeVerifier,
        codeChallenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
        consentToken,
        transactionState,
    }

    // Store the auth request in a transaction-specific cookie
    const cookieName = `SSOJet1_req_${transactionState}`
    setCookie(c, cookieName, btoa(JSON.stringify(SSOJetAuthRequest)), {
        path: '/',
        httpOnly: true,
        secure: c.env.NODE_ENV !== 'development',
        sameSite: c.env.NODE_ENV !== 'development' ? 'none' : 'lax',
        maxAge: 60 * 60 * 1, // 1 hour
    })

    // Extract client information for the consent screen
    const clientName = '' // client.clientName || client.clientId
    const clientLogo = '' //client.logoUri || '' // No default logo
    const clientUri = '' //client.clientUri || '#'
    const requestedScopes = (c.env.SSOJET_SCOPE || '').split(' ')

    // Render the consent screen with CSRF protection
    return c.html(
        renderConsentScreen({
            clientName,
            clientLogo,
            clientUri,
            redirectUri: mcpClientAuthRequest.redirectUri,
            requestedScopes,
            transactionState,
            consentToken,
        }),
    )
}

/**
 * Consent Confirmation Endpoint
 *
 * This route handles the consent confirmation before redirecting to SSOJet
 */
export async function confirmConsent(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
    // Get form data
    const formData = await c.req.formData()
    const transactionState = formData.get('transaction_state') as string
    const consentToken = formData.get('consent_token') as string
    const consentAction = formData.get('consent_action') as string

    // Validate the transaction state
    if (!transactionState) {
        return c.text('Invalid transaction state', 400)
    }

    // Get the transaction-specific cookie
    const cookieName = `SSOJet1_req_${transactionState}`
    const SSOJetAuthRequestCookie = getCookie(c, cookieName)
    if (!SSOJetAuthRequestCookie) {
        return c.text('Invalid or expired transaction', 400)
    }

    // Parse the SSOJet auth request from the cookie
    const SSOJetAuthRequest = JSON.parse(atob(SSOJetAuthRequestCookie)) as SSOJetAuthRequest

    // Validate the CSRF token
    if (SSOJetAuthRequest.consentToken !== consentToken) {
        return c.text('Invalid consent token', 403)
    }

    // Handle user denial
    if (consentAction !== 'approve') {
        // Parse the MCP client auth request to get the original redirect URI
        const redirectUri = new URL(SSOJetAuthRequest.mcpAuthRequest.redirectUri)

        // Add error parameters to the redirect URI
        redirectUri.searchParams.set('error', 'access_denied')
        redirectUri.searchParams.set('error_description', 'User denied the request')
        if (SSOJetAuthRequest.mcpAuthRequest.state) {
            redirectUri.searchParams.set('state', SSOJetAuthRequest.mcpAuthRequest.state)
        }

        // Clear the transaction cookie
        setCookie(c, cookieName, '', {
            path: '/',
            maxAge: 0,
        })

        return c.redirect(redirectUri.toString())
    }

    const { as } = await getOidcConfig({
        issuer: c.env.SSOJET_ISSUER,
        client_id: c.env.SSOJET_CLIENT_ID,
        client_secret: c.env.SSOJET_CLIENT_SECRET,
    })

    // Redirect to SSOJet's authorization endpoint
    const authorizationUrl = new URL(as.authorization_endpoint!)
    authorizationUrl.searchParams.set('client_id', c.env.SSOJET_CLIENT_ID)
    authorizationUrl.searchParams.set('redirect_uri', new URL('/callback', c.req.url).href)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('audience', c.env.SSOJET_ISSUER)
    authorizationUrl.searchParams.set('scope', c.env.SSOJET_SCOPE)
    authorizationUrl.searchParams.set('code_challenge', SSOJetAuthRequest.codeChallenge)
    authorizationUrl.searchParams.set('code_challenge_method', 'S256')
    authorizationUrl.searchParams.set('nonce', SSOJetAuthRequest.nonce)
    authorizationUrl.searchParams.set('state', transactionState)

    return c.redirect(authorizationUrl.href)
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from SSOJet after user authentication.
 * It exchanges the authorization code for tokens and completes the
 * authorization process.
 */
export async function callback(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
    // Parse the state parameter to extract transaction state and SSOJet state

    const stateParam = c.req.query('state') as string
    if (!stateParam) {
        return c.text('Invalid state parameter', 400)
    }

    // Parse the SSOJet auth request from the transaction-specific cookie
    const cookieName = `SSOJet1_req_${stateParam}`
    const SSOJetAuthRequestCookie = getCookie(c, cookieName)
    if (!SSOJetAuthRequestCookie) {
        return c.text('Invalid transaction state or session expired', 400)
    }

    const SSOJetAuthRequest = JSON.parse(atob(SSOJetAuthRequestCookie)) as SSOJetAuthRequest

    // Clear the transaction cookie as it's no longer needed
    setCookie(c, cookieName, '', {
        path: '/',
        maxAge: 0,
    })

    const { as, client, clientAuth } = await getOidcConfig({
        issuer: c.env.SSOJET_ISSUER,
        client_id: c.env.SSOJET_CLIENT_ID,
        client_secret: c.env.SSOJET_CLIENT_SECRET,
    })

    // Perform the Code Exchange

    const params = oauth.validateAuthResponse(as, client, new URL(c.req.url), SSOJetAuthRequest.transactionState)

    const response = await oauth.authorizationCodeGrantRequest(
        as,
        client,
        clientAuth,
        params,
        new URL('/callback', c.req.url).href,
        SSOJetAuthRequest.codeVerifier,
    )
    // Process the response
    const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
        expectedNonce: SSOJetAuthRequest.nonce,
        requireIdToken: true,
    })

    // Get the claims from the id_token
    const claims = oauth.getValidatedIdTokenClaims(result)
    if (!claims) {
        return c.text('Received invalid id_token from SSOJet', 400)
    }

    // Complete the authorization
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: SSOJetAuthRequest.mcpAuthRequest,
        userId: claims.sub!,
        metadata: {
            label: claims.name || claims.email || claims.sub,
        },
        scope: SSOJetAuthRequest.mcpAuthRequest.scope,
        props: {
            claims: claims,
            tokenSet: {
                idToken: result.id_token,
                accessToken: result.access_token,
                accessTokenTTL: result.expires_in,
                refreshToken: result.refresh_token,
            },
        } as UserProps,
    })

    return Response.redirect(redirectTo)
}

/**
 * Token Exchange Callback
 *
 * This function handles the token exchange callback for the CloudflareOAuth Provider and allows us to then interact with the Upstream IdP (your SSOJet tenant)
 */
export async function tokenExchangeCallback(options: TokenExchangeCallbackOptions): Promise<TokenExchangeCallbackResult | void> {
    // During the Authorization Code Exchange, we want to make sure that the Access Token issued
    // by the MCP Server has the same TTL as the one issued by SSOJet.
    if (options.grantType === 'authorization_code') {
        return {
            newProps: {
                ...options.props,
            },
            accessTokenTTL: options.props.tokenSet.accessTokenTTL,
        }
    }

    if (options.grantType === 'refresh_token') {
        const SSOJetRefreshToken = options.props.tokenSet.refreshToken
        if (!SSOJetRefreshToken) {
            throw new Error('No SSOJet refresh token found')
        }

        const { as, client, clientAuth } = await getOidcConfig({
            issuer: env.SSOJET_ISSUER,
            client_id: env.SSOJET_CLIENT_ID,
            client_secret: env.SSOJET_CLIENT_SECRET,
        })

        // Perform the refresh token exchange with SSOJet.
        const response = await oauth.refreshTokenGrantRequest(as, client, clientAuth, SSOJetRefreshToken)
        const refreshTokenResponse = await oauth.processRefreshTokenResponse(as, client, response)

        // Get the claims from the id_token
        const claims = oauth.getValidatedIdTokenClaims(refreshTokenResponse)
        if (!claims) {
            throw new Error('Received invalid id_token from SSOJet')
        }

        // Store the new token set and claims.
        return {
            newProps: {
                ...options.props,
                claims: claims,
                tokenSet: {
                    idToken: refreshTokenResponse.id_token,
                    accessToken: refreshTokenResponse.access_token,
                    accessTokenTTL: refreshTokenResponse.expires_in,
                    refreshToken: refreshTokenResponse.refresh_token || SSOJetRefreshToken,
                },
            },
            accessTokenTTL: refreshTokenResponse.expires_in,
        }
    }
}

/**
 * Renders the consent screen HTML
 */
function renderConsentScreen({
    clientName,
    clientLogo,
    clientUri,
    redirectUri,
    requestedScopes,
    transactionState,
    consentToken,
}: {
    clientName: string
    clientLogo: string
    clientUri: string
    redirectUri: string
    requestedScopes: string[]
    transactionState: string
    consentToken: string
}) {
    return html`
 <!DOCTYPE html>
<html>

<head>
    <meta charset='utf-8'>
    <meta http-equiv='X-UA-Compatible' content='IE=edge'>
    <title>SSOJet | Login</title>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
    <link rel="icon" type="image/x-icon" href="favicon.svg">
    <link rel="stylesheet" href="https://cdn.ssojet.com/assets/dev/css/ssojet-main.min.css?v=11.2.0">
      <style>
                    :root {
                        --primary-color: #4361ee;
                        --text-color: #333;
                        --background-color: #f7f7f7;
                        --card-background: #ffffff;
                        --border-color: #e0e0e0;
                        --danger-color: #ef233c;
                        --success-color: #2a9d8f;
                        --font-family:
                            -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue',
                            sans-serif;
                    }

                    body {
                        font-family: var(--font-family);
                        background-color: var(--background-color);
                        color: var(--text-color);
                        margin: 0;
                        padding: 0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }

                    .container {
                        width: 100%;
                        max-width: 480px;
                        padding: 20px;
                    }

                    .card {
                        background-color: var(--card-background);
                        border-radius: 12px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        padding: 32px;
                        overflow: hidden;
                    }

                    .header {
                        text-align: center;
                        margin-bottom: 24px;
                    }

                    .app-logo {
                        width: 80px;
                        height: 80px;
                        object-fit: contain;
                        border-radius: 8px;
                        margin-bottom: 16px;
                    }

                    h1 {
                        font-size: 20px;
                        margin: 0 0 8px 0;
                    }

                    .app-link {
                        color: var(--primary-color);
                        text-decoration: none;
                        font-size: 14px;
                    }

                    .app-link:hover {
                        text-decoration: underline;
                    }

                    .description {
                        margin: 0 0 24px 0;
                        font-size: 16px;
                        line-height: 1.5;
                        color: #747778;
                    }

                    .scopes {
                        background-color: var(--background-color);
                        border-radius: 8px;
                        padding: 16px;
                        margin: 24px 0;
                    }

                    .scope-title {
                        font-weight: 600;
                        margin-bottom: 8px;
                        font-size: 15px;
                    }

                    .scope-list {
                        font-size: 14px;
                        padding-left: 20px;
                    }
                    .mb-0 {
                        margin-bottom: 0;
                    }
                    .actions {
                        display: flex;
                        gap: 12px;
                        margin-top: 24px;
                    }

                    .btn {
                        flex: 1;
                        padding: 12px 20px;
                        font-size: 16px;
                        font-weight: 500;
                        border-radius: 8px;
                        cursor: pointer;
                        border: none;
                        transition: all 0.2s ease;
                    }

                    .btn-cancel {
                        background-color: transparent;
                        border: 1px solid var(--border-color);
                        color: var(--text-color);
                    }

                    .btn-cancel:hover {
                        background-color: rgba(0, 0, 0, 0.05);
                        color: white;
                    }
                  
                    .btn-approve {
                        background-color: var(--primary-color);
                        color: white;
                    }

                    .btn-approve:hover {
                        background-color: #3250d2;
                    }

                    .security-note {
                        margin-top: 24px;
                        font-size: 12px;
                        color: #747778;
                        text-align: center;
                    }

                    @media (max-width: 520px) {
                        .container {
                            padding: 10px;
                        }

                        .card {
                            padding: 24px;
                            border-radius: 8px;
                        }
                    }
                </style>
</head>

<body>
    <div class="signin-pageLayout-wrapper v-middle">
        <div class="signin-pageLayout-bg"></div>
        <div class="signin-pageLayout">
<div class="login-card">
    <div class="header">
        <div class="logo">
            <img src="https://ssojet.com/images/logo-black.png" alt="SSOJet" class="logo">
        </div>
        <div class="login-card-title">
            <div class="title">
                <h1>Allow Access</h1>
            </div>
        </div>
    </div>
<div>
    <p class="description">
        <strong>${clientName}</strong> is requesting access to:
    </p>

    <ul class="scope-list description">
        ${raw(requestedScopes.map((scope) => `<li>${scope}</li>`).join('\n'))}
    </ul>

    <p class="description mb-0">
        If you don’t recognize this request from <i>${redirectUri}</i>, click Deny.
    </p>
</div>
    <form method="POST" action="/authorize/consent">
        <input type="hidden" name="transaction_state" value="${transactionState}" />
        <input type="hidden" name="consent_token" value="${consentToken}" />

        <div class="actions">
            <button type="submit" name="consent_action" value="deny" class="btn btn-cancel">Deny</button>
            <button type="submit" name="consent_action" value="approve" class="btn btn-approve">Allow Access</button>
        </div>
    </form>

    <div class="term-links">
        By continuing, you agree to SSOJet’s 
        <a href="https://ssojet.com/terms/" target="_blank">Terms</a> and 
        <a href="https://ssojet.com/privacy/" target="_blank">Privacy Policy</a>.
    </div>
</div>


        </div>
        <div class="footer">Secured by<a href="https://ssojet.com/?utm_source=sign_in&amp;utm_medium=secured_by"
                target="_blank"> <img src="https://ssojet.com/images/logo-black.png" alt="SSOJet"
                    class="ssojet-logo"></a></div>
    </div>
</body>

</html>
    `
}
