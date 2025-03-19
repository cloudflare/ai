import OAuthProvider, { AuthRequest, OAuthHelpers } from './oauth/oauth-provider'
import { MCPEntrypoint } from './lib/MCPEntrypoint'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Hono } from 'hono'
import pick from 'just-pick'
import { WebClient } from '@slack/web-api'

// Context from the auth process, encrypted & stored in the auth token
// and provided to the MCP Server as this.props
type Props = {
  userId: string
  userName: string
  teamId: string
  teamName: string
  accessToken: string
  scope: string
}

export class SlackMCP extends MCPEntrypoint<Props> {
  get server() {
    const server = new McpServer({
      name: 'Slack Assistant MCP',
      version: '1.0.0',
    })

    server.tool('whoami', 'Get information about your Slack user', {}, async () => ({
      content: [{ type: 'text', text: JSON.stringify(pick(this.props, 'userId', 'userName', 'teamName', 'scope')) }],
    }))

    server.tool('listChannels', 'Get a list of channels from your Slack workspace', {}, async () => {
      const slack = new WebClient(this.props.accessToken)
      const response = await slack.conversations.list({
        exclude_archived: true,
        types: 'public_channel'
      })
      
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify(response.channels, null, 2) 
        }] 
      }
    })
    
    server.tool('getChannelMessages', 'Get recent messages from a specific channel', {
      channelId: z.string().describe('The Slack channel ID'),
      limit: z.number().min(1).max(100).default(10).describe('Number of messages to retrieve')
    }, async ({ channelId, limit }) => {
      const slack = new WebClient(this.props.accessToken)
      const response = await slack.conversations.history({
        channel: channelId,
        limit
      })
      
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify(response.messages, null, 2) 
        }] 
      }
    })
    
    server.tool('getDailyUpdate', 'Get a daily summary of important Slack messages', {}, async () => {
      const slack = new WebClient(this.props.accessToken)
      
      // Get list of channels
      const channelsResponse = await slack.conversations.list({
        exclude_archived: true,
        types: 'public_channel',
        limit: 10
      })
      
      const channels = channelsResponse.channels || []
      let allMessages = []
      
      // Get messages from each channel (limited to 5 for this demo)
      for (const channel of channels.slice(0, 5)) {
        if (channel.id) {
          const messagesResponse = await slack.conversations.history({
            channel: channel.id,
            limit: 10
          })
          
          if (messagesResponse.messages && messagesResponse.messages.length > 0) {
            allMessages.push({
              channelName: channel.name,
              channelId: channel.id,
              messages: messagesResponse.messages
            })
          }
        }
      }
      
      return {
        content: [{
          type: 'text',
          text: `# Daily Slack Update for ${this.props.userName}\n\n` +
                `Team: ${this.props.teamName}\n\n` +
                allMessages.map(channel => 
                  `## Channel: ${channel.channelName}\n\n` +
                  channel.messages.map(msg => 
                    `- ${msg.user || 'User'}: ${msg.text || 'No text'}\n`
                  ).join('')
                ).join('\n\n')
        }]
      }
    })
    
    // This tool will fail because we only requested read permissions
    server.tool('postMessage', 'Attempt to post a message to a channel (will fail due to read-only permissions)', {
      channelId: z.string().describe('The Slack channel ID'),
      message: z.string().describe('The message to post')
    }, async ({ channelId, message }) => {
      const slack = new WebClient(this.props.accessToken)
      
      try {
        const response = await slack.chat.postMessage({
          channel: channelId,
          text: message
        })
        
        return {
          content: [{
            type: 'text',
            text: 'Message posted successfully! This should not happen with read-only permissions.'
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Failed to post message as expected with read-only permissions: ${error.message || JSON.stringify(error)}\n\nThis demonstrates that the MCP has properly limited access to read-only operations.`
          }]
        }
      }
    })
    
    return server
  }
}

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>()

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Slack OAuth flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original OAuth request information in KV storage for later retrieval.
 * Then it redirects the user to Slack's authorization page with the appropriate
 * parameters so the user can authenticate and grant permissions.
 */
app.get('/authorize', async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
  // Store the request info in KV to catch it on the callback
  const randomString = crypto.randomUUID()
  await c.env.OAUTH_KV.put(`login:${randomString}`, JSON.stringify(oauthReqInfo), { expirationTtl: 600 })

  const upstream = new URL(`https://slack.com/oauth/v2/authorize`)
  upstream.searchParams.set('client_id', c.env.SLACK_CLIENT_ID)
  upstream.searchParams.set('redirect_uri', `https://${c.req.headers.get('host')}/callback`)
  // Explicitly only request read permissions to demonstrate security constraints
  upstream.searchParams.set('scope', 'channels:history,channels:read,users:read')
  upstream.searchParams.set('state', randomString)
  upstream.searchParams.set('user_scope', '')

  return Response.redirect(upstream.href)
})

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Slack after user authentication.
 * It exchanges the temporary code for an access token, then stores user
 * metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get('/callback', async (c) => {
  const code = c.req.query('code') as string

  // Get the oauthReqInfo out of KV
  const randomString = c.req.query('state')
  if (!randomString) {
    return c.text('Missing state', 400)
  }
  const oauthReqInfo = await c.env.OAUTH_KV.get<AuthRequest>(`login:${randomString}`, { type: 'json' })
  if (!oauthReqInfo) {
    return c.text('Invalid state', 400)
  }

  // Exchange the code for an access token
  const resp = await fetch(`https://slack.com/api/oauth.v2.access`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: c.env.SLACK_CLIENT_ID,
      client_secret: c.env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: `https://${c.req.headers.get('host')}/callback`,
    }).toString(),
  })

  if (!resp.ok) {
    console.log(await resp.text())
    return c.text('Failed to fetch access token', 500)
  }

  const data = await resp.json()
  if (!data.ok) {
    console.log(data)
    return c.text(`Slack API error: ${data.error || 'Unknown error'}`, 500)
  }

  const accessToken = data.access_token
  if (!accessToken) {
    return c.text('Missing access token', 400)
  }

  // Get user info from the Slack API response
  const userId = data.authed_user?.id || 'unknown'
  const userName = data.authed_user?.name || 'unknown'
  const teamId = data.team?.id || 'unknown'
  const teamName = data.team?.name || 'unknown'
  const scope = data.scope || ''

  // Return back to the MCP client a new token
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: userId,
    metadata: {
      label: userName,
    },
    scope: oauthReqInfo.scope,
    // This will be available on this.props inside SlackMCP
    props: {
      userId,
      userName,
      teamId,
      teamName,
      accessToken,
      scope
    } as Props,
  })

  return Response.redirect(redirectTo)
})

// Simple index page to explain what this worker does
app.get('/', async (c) => {
  return c.html(`
    <html>
      <head>
        <title>Slack Assistant MCP</title>
        <style>
          body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
          pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow: auto; }
        </style>
      </head>
      <body>
        <h1>Slack Assistant MCP</h1>
        <p>This is a Model Context Protocol (MCP) server that provides read-only access to your Slack data.</p>
        <p>To use this service, connect to: <code>${new URL('/sse', c.req.url).href}</code> in your MCP client.</p>
        <h2>Features</h2>
        <ul>
          <li>Read-only access to Slack channels and messages</li>
          <li>Daily summaries of important messages</li>
          <li>Demonstration of secure OAuth scoping</li>
        </ul>
        <h2>Available Tools</h2>
        <ul>
          <li><code>whoami</code>: Get information about your Slack user</li>
          <li><code>listChannels</code>: Get a list of channels from your Slack workspace</li>
          <li><code>getChannelMessages</code>: Get recent messages from a specific channel</li>
          <li><code>getDailyUpdate</code>: Get a daily summary of important Slack messages</li>
          <li><code>postMessage</code>: Attempt to post a message (will fail with read-only permissions)</li>
        </ul>
      </body>
    </html>
  `)
})

export default new OAuthProvider({
  apiRoute: '/sse',
  apiHandler: SlackMCP.Router,
  defaultHandler: app,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
})