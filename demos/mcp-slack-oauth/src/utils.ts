/**
 * Constructs an authorization URL for an upstream service.
 *
 * @param {Object} options
 * @param {string} options.upstream_url - The base URL of the upstream service.
 * @param {string} options.client_id - The client ID of the application.
 * @param {string} options.redirect_uri - The redirect URI of the application.
 * @param {string} options.scope - The requested scopes.
 * @param {string} [options.state] - The state parameter for CSRF protection.
 *
 * @returns {string} The authorization URL.
 */
export function getUpstreamAuthorizeUrl({
	upstream_url,
	client_id,
	scope,
	redirect_uri,
	state,
}: {
	upstream_url: string;
	client_id: string;
	scope: string;
	redirect_uri: string;
	state?: string;
}) {
	const upstream = new URL(upstream_url);
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("scope", scope);
	if (state) upstream.searchParams.set("state", state);
	return upstream.href;
}

/**
 * Adds CORS headers to a response
 * @param response - The response to add CORS headers to
 * @param request - The original request
 * @returns A new Response with CORS headers added
 */
export function addCorsHeaders(response: Response, request: Request): Response {
	// Get the Origin header from the request
	const origin = request.headers.get("Origin");

	// If there's no Origin header, return the original response
	if (!origin) {
		return response;
	}

	// Create a new response that copies all properties from the original response
	// This makes the response mutable so we can modify its headers
	const newResponse = new Response(response.body, response);

	// Add CORS headers
	newResponse.headers.set("Access-Control-Allow-Origin", origin);
	newResponse.headers.set("Access-Control-Allow-Methods", "*");
	// Include Authorization explicitly since it's not included in * for security reasons
	newResponse.headers.set("Access-Control-Allow-Headers", "Authorization, *");
	newResponse.headers.set("Access-Control-Max-Age", "86400"); // 24 hours

	return newResponse;
}
