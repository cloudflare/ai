import {TodoMCP} from "./TodoMCP.ts";
import {scalekitBearerTokenAuthMiddleware, scalekitSessionAuthMiddleware, exchangeCodeForToken} from "./lib/auth";
import {TodoAPI} from "./TodoAPI.ts";
import {cors} from "hono/cors";
import {setCookie, deleteCookie} from "hono/cookie";
import {Hono} from "hono";

// Export the TodoMCP class so the Worker runtime can find it
export {TodoMCP};

export default new Hono<{ Bindings: Env }>()
    .use(cors())

    // Mount the TODO API underneath us
    .route('/api', TodoAPI)

    // Serve the OAuth Protected Resource metadata per the 6-18 Auth specification
    // Note: Certain clients will infer the OPR metadata endpoint instead of taking it from the WWW-Auth header
    // So we should support .well-known/OPR as well as .well-known/OPR/sse and .well-known/OPR/mcp
    .get('/.well-known/oauth-protected-resource/:transport?', async (c) => {
        const url = new URL(c.req.url);
        const mcpUrl = url.origin;
        return c.json({
            resource: mcpUrl,
            resource_documentation: `${mcpUrl}/docs`,
            authorization_servers: ["https://devrampdemoapp-afx5w3bgaaba2.scalekit.com/resources/res_103555828077823247"],
            bearer_methods_supported: ["header"],
            scopes_supported: [],
        });
    })

    // Backwards compatibility for the 3-26 Auth Specification, which is still supported by some clients as a fallback
    // Serve the OAuth Authorization Server response for Dynamic Client Registration
    .get('/.well-known/oauth-authorization-server', async (c) => {
        const metadata = {
            issuer: c.env.SCALEKIT_ENVIRONMENT_URL,
            // Link to the OAuth Authorization screen implemented within the React UI
            authorization_endpoint: `${c.env.SCALEKIT_ENVIRONMENT_URL}/oauth/authorize`,
            token_endpoint: `${c.env.SCALEKIT_ENVIRONMENT_URL}/oauth/token`,
            registration_endpoint: `${c.env.SCALEKIT_ENVIRONMENT_URL}/oauth/register`,
            scopes_supported: ['openid', 'email', 'profile', 'mcp:tools:*', 'mcp:resources:*'],
            response_types_supported: ['code'],
            response_modes_supported: ['query'],
            grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
            token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
            code_challenge_methods_supported: ['S256'],
        }
        return c.json(metadata);
    })

    // OAuth callback endpoint - exchanges authorization code for access token
    .post('/api/auth/callback', async (c) => {
        try {
            const { code } = await c.req.json();
            
            if (!code) {
                return c.json({ error: 'Authorization code is required' }, 400);
            }
            
            // Check if this code was already processed (prevent reuse)
            const codeKey = `code_${code}`;
            const processedCode = await c.env.TODOS.get(codeKey);
            if (processedCode) {
                console.warn('Authorization code already used');
                return c.json({ error: 'Authorization code already used' }, 400);
            }
            
            // Mark code as processed (expires in 5 minutes)
            await c.env.TODOS.put(codeKey, 'processed', { expirationTtl: 300 });
            
            const redirectUri = `${new URL(c.req.url).origin}/authenticate`;
            
            const tokenResponse = await exchangeCodeForToken(code, redirectUri, c.env);
            
            // Store both access_token and id_token in cookie (we'll use id_token for user info)
            const tokenToStore = tokenResponse.id_token || tokenResponse.access_token;
            
            // Set session cookie using setCookie helper
            setCookie(c, 'scalekit_session', tokenToStore, {
                httpOnly: true,
                secure: c.req.url.startsWith('https'), // Only secure in production
                sameSite: 'lax',
                maxAge: tokenResponse.expires_in || 60 * 60 * 24 * 7, // 7 days default
                path: '/',
            });
            
            return c.json({ 
                accessToken: tokenResponse.access_token,
                idToken: tokenResponse.id_token,
                expiresIn: tokenResponse.expires_in
            });
        } catch (error) {
            console.error('OAuth callback error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Token exchange failed';
            return c.json({ error: errorMessage }, 400);
        }
    })

    // Logout endpoint
    .post('/api/auth/logout', async (c) => {
        deleteCookie(c, 'scalekit_session', {
            path: '/',
        });
        return c.json({ success: true });
    })

    // Validate session endpoint
    .get('/api/auth/validate', scalekitSessionAuthMiddleware, async (c) => {
        return c.json({ valid: true, userId: c.var.userID });
    })

    // Let the MCP Server have a go at handling the request
    // This adds SSE Transport support, for backwards compatibility
    .use('/sse/*', scalekitBearerTokenAuthMiddleware)
    .route('/sse', new Hono().mount('/', TodoMCP.serveSSE('/sse').fetch))

    // This adds HTTP Streaming support (the new preferred transport)
    .use('/mcp', scalekitBearerTokenAuthMiddleware)
    .route('/mcp', new Hono().mount('/', TodoMCP.serve('/mcp').fetch))

    // Finally - serve static assets from Vite
    .mount('/', (req, env) => env.ASSETS.fetch(req))
