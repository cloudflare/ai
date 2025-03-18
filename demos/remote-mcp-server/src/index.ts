import app from './routes'
import OAuthProvider from '../lib/workers-oauth-provider'
import { MCPEntrypoint } from './lib/MCPEntrypoint'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export class MyMCP extends MCPEntrypoint {
  get server() {
    const server = new McpServer({
      name: 'Demo',
      version: '1.0.0',
    })
    server.tool('add', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
      content: [{ type: 'text', text: String(a + b) }],
    }))
    return server
  }
}

// Export the OAuth handler as the default
export default new OAuthProvider({
  apiRoute: '/sse',
  apiHandler: MyMCP.Router,
  defaultHandler: app,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
})
