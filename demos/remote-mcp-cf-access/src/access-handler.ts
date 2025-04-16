import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { Context, Hono } from 'hono'
import {
    clientIdAlreadyApproved,
    parseRedirectApproval,
    renderApprovalDialog,
    fetchUpstreamAuthToken,
    getUpstreamAuthorizeUrl,
    Props,
} from './workers-oauth-utils'
import { verifyToken } from './jwt'

type honocontext = { Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }
const app = new Hono<honocontext>()

app.get('/authorize', async (c) => {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
    const { clientId } = oauthReqInfo
    if (!clientId) {
        return c.text('Invalid request', 400)
    }

    if (await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
        return redirectToAccess(c, oauthReqInfo)
    }

    return renderApprovalDialog(c.req.raw, {
        client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
        server: {
            name: 'Cloudflare Access MCP Server',
            logo: 'https://avatars.githubusercontent.com/u/314135?s=200&v=4',
            description: 'This is a demo MCP Remote Server using Access for authentication.', // optional
        },
        state: { oauthReqInfo }, // arbitrary data that flows through the form submission below
    })
})

app.post('/authorize', async (c) => {
    // Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
    const { state, headers } = await parseRedirectApproval(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY)
    if (!state.oauthReqInfo) {
        return c.text('Invalid request', 400)
    }

    return redirectToAccess(c, state.oauthReqInfo, headers)
})

async function redirectToAccess(c: Context<honocontext>, oauthReqInfo: AuthRequest, headers: Record<string, string> = {}) {
    const request = c.req.raw
    return new Response(null, {
        status: 302,
        headers: {
            ...headers,
            location: getUpstreamAuthorizeUrl({
                upstream_url: c.env.ACCESS_AUTHORIZATION_URL,
                client_id: c.env.ACCESS_CLIENT_ID,
                scope: 'openid email profile',
                redirect_uri: new URL('/callback', request.url).href,
                state: btoa(JSON.stringify(oauthReqInfo)),
            }),
        },
    })
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Access after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get('/callback', async (c) => {
    // Get the oathReqInfo out of KV
    const oauthReqInfo = JSON.parse(atob(c.req.query('state') as string)) as AuthRequest
    if (!oauthReqInfo.clientId) {
        return c.text('Invalid state', 400)
    }

    // Exchange the code for an access token
    const [accessToken, idToken, errResponse] = await fetchUpstreamAuthToken({
        upstream_url: c.env.ACCESS_TOKEN_URL,
        client_id: c.env.ACCESS_CLIENT_ID,
        client_secret: c.env.ACCESS_CLIENT_SECRET,
        code: c.req.query('code'),
        redirect_uri: new URL('/callback', c.req.url).href,
    })
    if (errResponse) {
        return errResponse
    }

    const idTokenClaims = await verifyToken(c.env, idToken)
    const user = {
        sub: idTokenClaims.sub,
        name: idTokenClaims.name,
        email: idTokenClaims.email,
    }

    // Return back to the MCP client a new token
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: user.sub,
        metadata: {
            label: user.name,
        },
        scope: oauthReqInfo.scope,
        // This will be available on this.props inside MyMCP
        props: {
            login: user.sub,
            name: user.name,
            email: user.email,
            accessToken,
        } as Props,
    })
    return Response.redirect(redirectTo)
})

export { app as AccessHandler }
