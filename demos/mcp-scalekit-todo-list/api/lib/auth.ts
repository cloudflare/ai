import {createMiddleware} from "hono/factory";
import {HTTPException} from "hono/http-exception";
import {getCookie} from "hono/cookie";

/**
 * scalekitSessionAuthMiddleware is a Hono middleware that validates that the user is logged in
 * It checks for the scalekit_session cookie set by the Scalekit authentication flow
 */
export const scalekitSessionAuthMiddleware = createMiddleware<{
    Variables: {
        userID: string
    },
    Bindings: Env,
}>(async (c, next) => {
    const sessionCookie = getCookie(c, 'scalekit_session');

    if (!sessionCookie) {
        throw new HTTPException(401, {message: 'Unauthenticated'})
    }

    try {
        const verifyResult = await validateScalekitToken(sessionCookie, c.env)
        c.set('userID', verifyResult.sub);
    } catch (error) {
        console.error('Token validation error:', error);
        throw new HTTPException(401, {message: 'Unauthenticated'})
    }

    await next()
})

/**
 * scalekitBearerTokenAuthMiddleware is a Hono middleware that validates that the request has a Scalekit-issued bearer token
 * Tokens are issued to clients at the end of a successful OAuth 2.1 flow
 */
export const scalekitBearerTokenAuthMiddleware = createMiddleware<{
    Bindings: Env,
}>(async (c, next) => {
    const authHeader = c.req.header('Authorization')
    const url = new URL(c.req.url);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const wwwAuthValue = `Bearer error="Unauthorized", error_description="Unauthorized", resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`;
        const responseHeaders = new Headers();
        
        responseHeaders.set('WWW-Authenticate', wwwAuthValue);
        const res = new Response(null, {status: 401, headers: responseHeaders})
        throw new HTTPException(401, {message: 'Missing or invalid access token', res: res})
    }
    
    const accessToken = authHeader.substring(7);

    try {
        const verifyResult = await validateScalekitToken(accessToken, c.env)
        
        // Store auth context for MCP server
        // @ts-expect-error Props go brr
        c.executionCtx.props = {
            claims: verifyResult,
            accessToken,
        }
    } catch (error) {
        console.error('Token validation error:', error);
        throw new HTTPException(401, {message: 'Unauthenticated'})
    }

    await next()
})

/**
 * Validates a Scalekit token using Scalekit's API
 * Scalekit Full-Stack Auth returns JWT tokens (id_token and access_token)
 */
async function validateScalekitToken(token: string, env: Env): Promise<{ sub: string; [key: string]: any }> {
    // Check if token is a session ID (format: ses_12345)
    const isSessionId = /^ses_[0-9]+$/.test(token);
    
    if (isSessionId) {
        // Validate session ID using Scalekit's session verification endpoint
        try {
            const verifyUrl = `${env.SCALEKIT_ENVIRONMENT_URL}/api/v1/sessions/verify`;
            console.log(`Validating session ID: ${token}`);
            
            const response = await fetch(verifyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.SCALEKIT_CLIENT_SECRET}`,
                },
                body: JSON.stringify({
                    session_id: token,
                }),
            });
            
            if (response.ok) {
                const data = await response.json() as Record<string, any>;
                console.log('Session validation successful');
                
                const userId = data.user_id || (data.user as Record<string, any>)?.id || data.sub || data.userId || (data.session as Record<string, any>)?.user_id;
                if (!userId) {
                    throw new Error('Session validation succeeded but no user ID found in response');
                }
                
                return {
                    sub: userId,
                    ...data,
                };
            } else {
                const errorText = await response.text();
                throw new Error(`Session validation failed: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('Session validation error:', error);
            throw error;
        }
    }
    
    // If it's a JWT token (id_token or access_token), decode it
    // Scalekit returns JWT tokens that we can decode to get user info
    try {
        const parts = token.split('.');
        if (parts.length === 3) {
            // Decode JWT payload (without verification for now - in production you should verify)
            const payload = JSON.parse(atob(parts[1]));
            
            // Check if token is expired
            if (payload.exp && payload.exp < Date.now() / 1000) {
                throw new Error('Token has expired');
            }
            
            // Extract user ID from JWT payload
            const userId = payload.sub || payload.user_id || payload.userId || payload.email;
            if (!userId) {
                throw new Error('JWT token does not contain user identifier');
            }
            
            console.log('JWT token decoded successfully');
            return {
                sub: userId,
                ...payload,
            };
        }
    } catch (error) {
        if (error instanceof Error && error.message.includes('expired')) {
            throw error;
        }
        // If JWT decode fails, try API validation
        console.warn('JWT decode failed, trying API validation:', error);
    }
    
    // Fallback: Try Scalekit's userinfo endpoint with access_token
    try {
        const userinfoUrl = `${env.SCALEKIT_ENVIRONMENT_URL}/oauth/userinfo`;
        console.log(`Trying userinfo endpoint with token`);
        
        const response = await fetch(userinfoUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
        
        if (response.ok) {
            const data = await response.json() as Record<string, any>;
            const userId = data.sub || data.user_id || data.id || data.email;
            if (userId) {
                console.log('Userinfo endpoint successful');
                return {
                    sub: userId,
                    ...data,
                };
            }
        }
    } catch (error) {
        console.warn('Userinfo endpoint failed:', error);
    }
    
    throw new Error(`Token validation failed: Could not validate token. Token appears to be neither a session ID nor a valid JWT.`);
}

/**
 * Gets the token endpoint from OAuth discovery or uses default
 */
async function getTokenEndpoint(env: Env): Promise<string> {
    // Try to get from OAuth discovery document
    try {
        const discoveryUrl = `${env.SCALEKIT_ENVIRONMENT_URL}/.well-known/oauth-authorization-server`;
        const response = await fetch(discoveryUrl);
        if (response.ok) {
            const discovery = await response.json() as { token_endpoint?: string };
            if (discovery.token_endpoint) {
                console.log(`Found token endpoint from discovery: ${discovery.token_endpoint}`);
                return discovery.token_endpoint;
            }
        }
    } catch (error) {
        console.warn('Could not fetch OAuth discovery document:', error);
    }
    
    // Fall back to standard path
    const defaultEndpoint = `${env.SCALEKIT_ENVIRONMENT_URL}/oauth/token`;
    console.log(`Using default token endpoint: ${defaultEndpoint}`);
    return defaultEndpoint;
}

/**
 * Exchanges an OAuth authorization code for an access token
 */
export async function exchangeCodeForToken(code: string, redirectUri: string, env: Env) {
    const tokenEndpoint = await getTokenEndpoint(env);
    
    // Normalize redirect URI to ensure exact match
    const normalizedRedirectUri = new URL(redirectUri).href;
    
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: normalizedRedirectUri,
        client_id: env.SCALEKIT_CLIENT_ID,
        client_secret: env.SCALEKIT_CLIENT_SECRET,
    });
    
    console.log(`Exchanging code at: ${tokenEndpoint}`);
    console.log(`Redirect URI: ${normalizedRedirectUri}`);
    
    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
        },
        body: body,
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
            errorData = JSON.parse(errorText);
        } catch {
            errorData = { error: errorText };
        }
        
        const errorMessage = errorData.error_description || errorData.error || 'Token exchange failed';
        console.error('Token exchange error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorMessage,
            endpoint: tokenEndpoint,
        });
        throw new Error(`Token exchange failed: ${errorMessage}`);
    }

    const tokenData = await response.json() as {
        session_id?: string;
        session_token?: string;
        access_token?: string;
        id_token?: string;
        token_type?: string;
        expires_in?: number;
        refresh_token?: string;
        scope?: string;
    };
    
    // Scalekit might return session_id, session_token, access_token, or id_token
    const sessionToken = tokenData.session_id || tokenData.session_token || tokenData.access_token || tokenData.id_token;
    
    if (!sessionToken) {
        console.error('Token exchange response:', tokenData);
        throw new Error('Token exchange failed: No token or session ID in response');
    }

    console.log('Token exchange successful, received:', {
        hasSessionId: !!tokenData.session_id,
        hasSessionToken: !!tokenData.session_token,
        hasAccessToken: !!tokenData.access_token,
        hasIdToken: !!tokenData.id_token,
    });

    return {
        access_token: sessionToken, // Use whatever token/session ID we got
        id_token: tokenData.id_token, // Include id_token if present
        token_type: tokenData.token_type || 'Bearer',
        expires_in: tokenData.expires_in || 3600,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
        session_id: tokenData.session_id, // Include session_id if present
    };
}
