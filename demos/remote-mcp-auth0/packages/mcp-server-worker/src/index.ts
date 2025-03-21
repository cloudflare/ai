import OAuthProvider, { type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { DurableMCP } from 'workers-mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Hono } from 'hono'
import { fetchUpstreamAccessToken, getUpstreamAuthorizeUrl } from './utils'
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose'
// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
    claims: JWTPayload
    accessToken: string
    idToken: string
    refreshToken: string
}

export class MyMCP extends DurableMCP<Props, Env> {
    server = new McpServer({
        name: 'Auth0 OAuth Proxy Demo',
        version: '1.0.0',
    })

    async init() {
        // Hello, world!
        this.server.tool('add', 'Add two numbers the way only MCP can', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
            content: [{ type: 'text', text: String(a + b) }],
        }))

        // Use the upstream access token to facilitate tools
        this.server.tool('dayOfWeek', 'Get the day of the week from the API', {}, async () => {
            const response = await fetch('https://api-worker.mcp-demo.workers.dev/day_of_week', {
                headers: {
                    Authorization: `Bearer ${this.props.accessToken}`,
                },
            })

            const data = await response.json()
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(data),
                    },
                ],
            }
        })
    }
}

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>()

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Authorization Code Flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original request information in KV storage for later retrieval.
 * Then it redirects the user to Auth0's login page with the appropriate
 * parameters so the user can authenticate and grant permissions.
 */
app.get('/authorize', async (c) => {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
    if (!oauthReqInfo.clientId) {
        return c.text('Invalid request', 400)
    }

    return Response.redirect(
        getUpstreamAuthorizeUrl({
            upstream_url: `https://${c.env.AUTH0_DOMAIN}/authorize`,
            scope: c.env.AUTH0_SCOPE,
            audience: c.env.AUTH0_AUDIENCE,
            client_id: c.env.AUTH0_CLIENT_ID,
            redirect_uri: new URL('/callback', c.req.url).href,
            state: btoa(JSON.stringify(oauthReqInfo)),
        }),
    )
})

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Auth0 after user authentication.
 * It exchanges the authorization code for an id_token, access_token and optionally refresh_token, then stores some
 * user metadata & the tokens as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get('/callback', async (c) => {
    // Get the oathReqInfo out of KV
    const oauthReqInfo = JSON.parse(atob(c.req.query('state') as string)) as AuthRequest
    if (!oauthReqInfo.clientId) {
        return c.text('Invalid state', 400)
    }

    // Exchange the code for an access token
    const [idToken, accessToken, refreshToken, errResponse] = await fetchUpstreamAccessToken({
        upstream_url: `https://${c.env.AUTH0_DOMAIN}/oauth/token`,
        client_id: c.env.AUTH0_CLIENT_ID,
        client_secret: c.env.AUTH0_CLIENT_SECRET,
        code: c.req.query('code'),
        redirect_uri: new URL('/callback', c.req.url).href,
    })
    if (errResponse) {
        return errResponse
    }

    const JWKS = createRemoteJWKSet(new URL(`https://${c.env.AUTH0_DOMAIN}/.well-known/jwks.json`))
    const { payload } = await jwtVerify(idToken, JWKS)

    // Return back to the MCP client a new token
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: payload.sub!,
        metadata: {
            label: payload.name || payload.email || payload.sub,
        },
        scope: oauthReqInfo.scope,
        // This will be available on this.props inside MyMCP
        props: {
            claims: payload,
            idToken,
            accessToken,
            refreshToken,
        } as Props,
    })

    return Response.redirect(redirectTo)
})

export default new OAuthProvider({
    apiRoute: '/sse',
    apiHandler: MyMCP.mount('/sse'),
    defaultHandler: app,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
})
