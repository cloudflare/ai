import {TodoMCP} from "./TodoMCP.ts";
import {getStytchOAuthEndpointUrl, stytchBearerTokenAuthMiddleware} from "./lib/auth";
import {TodoAPI} from "./TodoAPI.ts";
import {cors} from "hono/cors";
import {Hono} from "hono";

// Export the TodoMCP class so the Worker runtime can find it
export {TodoMCP};

export default new Hono<{ Bindings: Env }>()
    .use(cors())

    // Mount the TODO API underneath us
    .route('/api', TodoAPI)

    // Serve the OAuth Authorization Server response for Dynamic Client Registration
    .get('/.well-known/oauth-authorization-server', async (c) => {
        const url = new URL(c.req.url);
        return c.json({
            issuer: c.env.STYTCH_PROJECT_ID,
            // Link to the OAuth Authorization screen implemented within the React UI
            authorization_endpoint: `${url.origin}/oauth/authorize`,
            token_endpoint: getStytchOAuthEndpointUrl(c.env, 'oauth2/token'),
            registration_endpoint: getStytchOAuthEndpointUrl(c.env, 'oauth2/register'),
            scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
            response_types_supported: ['code'],
            response_modes_supported: ['query'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_methods_supported: ['none'],
            code_challenge_methods_supported: ['S256'],
        })
    })

    // Let the MCP Server have a go at handling the request
    .use('/sse/*', stytchBearerTokenAuthMiddleware)
    .route('/sse', new Hono().mount('/', TodoMCP.mount('/sse').fetch))

    // Finally - serve static assets from Vite
    .mount('/', (req, env) => env.ASSETS.fetch(req))
