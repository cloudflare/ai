import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { GoogleHandler } from './google-handler'

// Context from the auth process, encrypted & stored in the auth token
// and provided to the MyMCP as this.props
type Props = {
  name: string
  email: string
  accessToken: string
}

export class MyMCP extends McpAgent<Env, {}, Props> {
  server = new McpServer({
    name: 'Google OAuth Proxy Demo',
    version: '0.0.1',
  })

  async init() {
    this.server.tool('add', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a + b) }],
    }))
  }
}

export default new OAuthProvider({
  apiRoute: '/sse',
  apiHandler: MyMCP.mount('/sse') as any,
  defaultHandler: GoogleHandler as any,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
})
