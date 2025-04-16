import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { AccessHandler } from './access-handler.js'

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
type Props = {
    login: string
    name: string
    email: string
    accessToken: string
}

const ALLOWED_EMAILS = new Set(['<INSERT EMAIL>'])

export class MyMCP extends McpAgent<Props, Env> {
    server = new McpServer({
        name: 'Access OAuth Proxy Demo',
        version: '1.0.0',
    })

    async init() {
        // Hello, world!
        this.server.tool('add', 'Add two numbers the way only MCP can', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
            content: [{ type: 'text', text: String(a + b) }],
        }))

        // Dynamically add tools based on the user's login. In this case, I want to limit
        // access to my Image Generation tool to just me
        // @ts-ignore
        if (ALLOWED_EMAILS.has(this.props.email)) {
            this.server.tool(
                'generateImage',
                'Generate an image using the `flux-1-schnell` model. Works best with 8 steps.',
                {
                    prompt: z.string().describe('A text description of the image you want to generate.'),
                    steps: z
                        .number()
                        .min(4)
                        .max(8)
                        .default(4)
                        .describe(
                            'The number of diffusion steps; higher values can improve quality but take longer. Must be between 4 and 8, inclusive.',
                        ),
                },
                async ({ prompt, steps }) => {
                    // @ts-ignore
                    const response = await this.env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
                        prompt,
                        steps,
                    })

                    return {
                        content: [{ type: 'image', data: response.image!, mimeType: 'image/jpeg' }],
                    }
                },
            )
        }
    }
}

export default new OAuthProvider({
    apiRoute: '/sse',
    apiHandler: MyMCP.mount('/sse') as any,
    defaultHandler: AccessHandler as any,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
})
