/**
 * Adds CORS headers to a response
 * @param response - The response to add CORS headers to
 * @param request - The original request
 * @returns A new Response with CORS headers added
 */
export function addCorsHeaders(response: Response, request: Request): Response {
  // Get the Origin header from the request
  const origin = request.headers.get('Origin')

  // If there's no Origin header, return the original response
  if (!origin) {
    return response
  }

  // Create a new response that copies all properties from the original response
  // This makes the response mutable so we can modify its headers
  const newResponse = new Response(response.body, response)

  // Add CORS headers
  newResponse.headers.set('Access-Control-Allow-Origin', origin)
  newResponse.headers.set('Access-Control-Allow-Methods', '*')
  // Include Authorization explicitly since it's not included in * for security reasons
  newResponse.headers.set('Access-Control-Allow-Headers', 'Authorization, *')
  newResponse.headers.set('Access-Control-Max-Age', '86400') // 24 hours

  return newResponse
}
