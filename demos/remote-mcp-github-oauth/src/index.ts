import OAuthProvider, { AuthRequest, OAuthHelpers } from 'workers-mcp/vendor/workers-oauth-provider/oauth-provider.js'
import { DurableMCP } from 'workers-mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Hono } from 'hono'
import { Octokit } from 'octokit'
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl } from './utils'

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
  login: string
  name: string
  email: string
  accessToken: string
}

export class MyMCP extends DurableMCP<Props, Env> {
  server = new McpServer({
    name: 'Github OAuth Proxy Demo',
    version: '1.0.0',
  })

  async init() {
    // Hello, world!
    this.server.tool('add', 'Add two numbers the way only MCP can', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a + b) }],
    }))

    // Use the upstream access token to facilitate tools
    this.server.tool('userInfoOctokit', 'Get user info from GitHub, via Octokit', {}, async () => {
      const octokit = new Octokit({ auth: this.props.accessToken })
      return { content: [{ type: 'text', text: JSON.stringify(await octokit.rest.users.getAuthenticated()) }] }
    })

    // Dynamically add tools based on the user's login. In this case, I want to limit
    // access to my Image Generation tool to just me
    if (this.props.login === 'geelen') {
      this.server.tool(
        'generateImage',
        'Generate an image using the `flux-1-schnell` model. Works best with 8 steps.',
        {
          prompt: z.string().describe(`A text description of the image you want to generate.`),
          steps: z
            .number()
            .min(4)
            .max(8)
            .default(4)
            .describe(
              `The number of diffusion steps; higher values can improve quality but take longer. Must be between 4 and 8, inclusive.`,
            ),
        },
        async ({ prompt, steps }) => {
          const response = await this.env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt, steps })

          return {
            content: [{ type: 'image', data: response.image!, mimeType: 'image/jpeg' }],
          }
        },
      )
    }
  }
}

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>()

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the GitHub OAuth flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original OAuth request information in KV storage for later retrieval.
 * Then it redirects the user to GitHub's authorization page with the appropriate
 * parameters so the user can authenticate and grant permissions.
 */
app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
  if (!oauthReqInfo.clientId) {
    return c.text('Invalid request', 400)
  }

  return Response.redirect(
    getUpstreamAuthorizeUrl({
      upstream_url: `https://github.com/login/oauth/authorize`,
      scope: 'read:user',
      client_id: c.env.GITHUB_CLIENT_ID,
      redirect_uri: new URL('/callback', c.req.url).href,
      state: btoa(JSON.stringify(oauthReqInfo)),
    }),
  )
})

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from GitHub after user authentication.
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
  const [accessToken, errResponse] = await fetchUpstreamAuthToken({
    upstream_url: `https://github.com/login/oauth/access_token`,
    client_id: c.env.GITHUB_CLIENT_ID,
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    code: c.req.query('code'),
    redirect_uri: new URL('/callback', c.req.url).href,
  })
  if (errResponse) return errResponse

  // Fetch the user info from GitHub
  const user = await new Octokit({ auth: accessToken }).rest.users.getAuthenticated()
  const { login, name, email } = user.data

  // Return back to the MCP client a new token
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: login,
    metadata: {
      label: name,
    },
    scope: oauthReqInfo.scope,
    // This will be available on this.props inside MyMCP
    props: {
      login,
      name,
      email,
      accessToken,
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
