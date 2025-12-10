/**
 * Creates a fetch function that properly intercepts requests for
 * Cloudflare AI Gateway unified billing and BYOK modes.
 *
 * This function solves the problem where the Authorization header
 * cannot be reliably removed after the SDK has prepared the request.
 * Instead, we build headers from scratch without ever including it.
 *
 * @param options - Configuration for the gateway fetch
 * @param options.cfToken - Cloudflare API token for gateway authentication
 * @param options.mode - Authentication mode ('byok' or 'unified-billing')
 * @returns A fetch function that removes provider auth and adds CF gateway auth
 */
export function createGatewayFetch(options: {
  cfToken: string
  mode: 'byok' | 'unified-billing'
}): typeof fetch {
  return async (
    url: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    console.log('🔵 createGatewayFetch called!')
    console.log('🔵 Mode:', options.mode)
    console.log('🔵 URL:', url)
    console.log('🔵 Init headers before processing:', init?.headers)

    // Build a new headers object from scratch, excluding Authorization
    const headers: Record<string, string> = {}

    // Extract existing headers from multiple possible formats
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        // Headers object - iterate and copy non-auth headers
        init.headers.forEach((value, key) => {
          const isAuthHeader = key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-api-key'
          console.log(
            `🔵 Header: ${key} = ${isAuthHeader ? '[FILTERED]' : value}`
          )
          if (!isAuthHeader) {
            headers[key] = value
          }
        })
      } else if (Array.isArray(init.headers)) {
        // Array of [key, value] tuples
        for (const [key, value] of init.headers) {
          const isAuthHeader = key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-api-key'
          console.log(
            `🔵 Header: ${key} = ${isAuthHeader ? '[FILTERED]' : value}`
          )
          if (!isAuthHeader) {
            headers[key] = value
          }
        }
      } else {
        // Plain object
        for (const [key, value] of Object.entries(init.headers)) {
          const isAuthHeader = key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-api-key'
          console.log(
            `🔵 Header: ${key} = ${isAuthHeader ? '[FILTERED]' : value}`
          )
          if (!isAuthHeader) {
            headers[key] = value
          }
        }
      }
    }

    // Add Cloudflare AI Gateway authorization header
    // This header tells the gateway how to authenticate with CF
    headers['cf-aig-authorization'] = `Bearer ${options.cfToken}`

    console.log('🔵 Final headers:', Object.keys(headers))
    console.log(
      '🔵 Has Authorization?',
      'authorization' in headers || 'Authorization' in headers
    )
    console.log('🔵 Has cf-aig-authorization?', 'cf-aig-authorization' in headers)

    // Create new init object with our custom headers
    const modifiedInit: RequestInit = {
      ...init,
      headers,
    }

    // Call the actual fetch with modified request
    return fetch(url, modifiedInit)
  }
}
