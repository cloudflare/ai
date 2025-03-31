import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import * as oauth from "oauth4webapi";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { UserProps } from "./types";

type Auth0AuthRequest = {
	mcpAuthRequest: AuthRequest;
	codeVerifier: string;
	codeChallenge: string;
	nonce: string;
	transactionState: string;
	consentToken: string;
};

export async function getOidcConfig({
	issuer,
	client_id,
	client_secret,
}: { issuer: string; client_id: string; client_secret: string }) {
	const as = await oauth
		.discoveryRequest(new URL(issuer), { algorithm: "oidc" })
		.then((response) => oauth.processDiscoveryResponse(new URL(issuer), response));

	const client: oauth.Client = { client_id };
	const clientAuth = oauth.ClientSecretPost(client_secret);

	return { as, client, clientAuth };
}

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Authorization Code Flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original request information in a state-specific cookie for later retrieval.
 * Then it shows a consent screen before redirecting to Auth0.
 */
export async function authorize(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
	const mcpClientAuthRequest = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!mcpClientAuthRequest.clientId) {
		return c.text("Invalid request", 400);
	}

	const client = await c.env.OAUTH_PROVIDER.lookupClient(mcpClientAuthRequest.clientId);
	if (!client) {
		return c.text("Invalid client", 400);
	}

	// Generate all that is needed for the Auth0 auth request
	const codeVerifier = oauth.generateRandomCodeVerifier();
	const transactionState = oauth.generateRandomState();
	const consentToken = oauth.generateRandomState(); // For CSRF protection on consent form

	// We will persist everything in a cookie.
	const auth0AuthRequest: Auth0AuthRequest = {
		mcpAuthRequest: mcpClientAuthRequest,
		nonce: oauth.generateRandomNonce(),
		codeVerifier,
		codeChallenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
		consentToken,
		transactionState,
	};

	// Store the auth request in a transaction-specific cookie
	const cookieName = `auth0_req_${transactionState}`;
	setCookie(c, cookieName, btoa(JSON.stringify(auth0AuthRequest)), {
		path: "/",
		httpOnly: true,
		secure: c.env.NODE_ENV !== "development",
		sameSite: c.env.NODE_ENV !== "development" ? "none" : "lax",
		maxAge: 60 * 60 * 1, // 1 hour
	});

	// Extract client information for the consent screen
	const clientName = client.clientName || client.clientId;
	const clientLogo = client.logoUri || ""; // No default logo
	const clientUri = client.clientUri || "#";
	const requestedScopes = (c.env.AUTH0_SCOPE || "").split(" ");

	// Render the consent screen with CSRF protection
	return c.html(
		renderConsentScreen({
			clientName,
			clientLogo,
			clientUri,
			redirectUri: mcpClientAuthRequest.redirectUri,
			requestedScopes,
			transactionState,
			consentToken,
		}),
	);
}

/**
 * Consent Confirmation Endpoint
 *
 * This route handles the consent confirmation before redirecting to Auth0
 */
export async function confirmConsent(
	c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>,
) {
	// Get form data
	const formData = await c.req.formData();
	const transactionState = formData.get("transaction_state") as string;
	const consentToken = formData.get("consent_token") as string;
	const consentAction = formData.get("consent_action") as string;

	// Validate the transaction state
	if (!transactionState) {
		return c.text("Invalid transaction state", 400);
	}

	// Get the transaction-specific cookie
	const cookieName = `auth0_req_${transactionState}`;
	const auth0AuthRequestCookie = getCookie(c, cookieName);
	if (!auth0AuthRequestCookie) {
		return c.text("Invalid or expired transaction", 400);
	}

	// Parse the Auth0 auth request from the cookie
	const auth0AuthRequest = JSON.parse(atob(auth0AuthRequestCookie)) as Auth0AuthRequest;

	// Validate the CSRF token
	if (auth0AuthRequest.consentToken !== consentToken) {
		return c.text("Invalid consent token", 403);
	}

	// Handle user denial
	if (consentAction !== "approve") {
		// Parse the MCP client auth request to get the original redirect URI
		const redirectUri = new URL(auth0AuthRequest.mcpAuthRequest.redirectUri);

		// Add error parameters to the redirect URI
		redirectUri.searchParams.set("error", "access_denied");
		redirectUri.searchParams.set("error_description", "User denied the request");
		if (auth0AuthRequest.mcpAuthRequest.state) {
			redirectUri.searchParams.set("state", auth0AuthRequest.mcpAuthRequest.state);
		}

		// Clear the transaction cookie
		setCookie(c, cookieName, "", {
			path: "/",
			maxAge: 0,
		});

		return c.redirect(redirectUri.toString());
	}

	const { as } = await getOidcConfig({
		issuer: `https://${c.env.AUTH0_DOMAIN}/`,
		client_id: c.env.AUTH0_CLIENT_ID,
		client_secret: c.env.AUTH0_CLIENT_SECRET,
	});

	// Redirect to Auth0's authorization endpoint
	const authorizationUrl = new URL(as.authorization_endpoint!);
	authorizationUrl.searchParams.set("client_id", c.env.AUTH0_CLIENT_ID);
	authorizationUrl.searchParams.set("redirect_uri", new URL("/callback", c.req.url).href);
	authorizationUrl.searchParams.set("response_type", "code");
	authorizationUrl.searchParams.set("audience", c.env.AUTH0_AUDIENCE);
	authorizationUrl.searchParams.set("scope", c.env.AUTH0_SCOPE);
	authorizationUrl.searchParams.set("code_challenge", auth0AuthRequest.codeChallenge);
	authorizationUrl.searchParams.set("code_challenge_method", "S256");
	authorizationUrl.searchParams.set("nonce", auth0AuthRequest.nonce);
	authorizationUrl.searchParams.set("state", transactionState);
	return c.redirect(authorizationUrl.href);
}

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Auth0 after user authentication.
 * It exchanges the authorization code for tokens and completes the
 * authorization process.
 */
export async function callback(c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) {
	// Parse the state parameter to extract transaction state and Auth0 state
	const stateParam = c.req.query("state") as string;
	if (!stateParam) {
		return c.text("Invalid state parameter", 400);
	}

	// Parse the Auth0 auth request from the transaction-specific cookie
	const cookieName = `auth0_req_${stateParam}`;
	const auth0AuthRequestCookie = getCookie(c, cookieName);
	if (!auth0AuthRequestCookie) {
		return c.text("Invalid transaction state or session expired", 400);
	}

	const auth0AuthRequest = JSON.parse(atob(auth0AuthRequestCookie)) as Auth0AuthRequest;

	// Clear the transaction cookie as it's no longer needed
	setCookie(c, cookieName, "", {
		path: "/",
		maxAge: 0,
	});

	const { as, client, clientAuth } = await getOidcConfig({
		issuer: `https://${c.env.AUTH0_DOMAIN}/`,
		client_id: c.env.AUTH0_CLIENT_ID,
		client_secret: c.env.AUTH0_CLIENT_SECRET,
	});

	// Perform the Code Exchange
	const params = oauth.validateAuthResponse(
		as,
		client,
		new URL(c.req.url),
		auth0AuthRequest.transactionState,
	);
	const response = await oauth.authorizationCodeGrantRequest(
		as,
		client,
		clientAuth,
		params,
		new URL("/callback", c.req.url).href,
		auth0AuthRequest.codeVerifier,
	);

	// Process the response
	const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
		expectedNonce: auth0AuthRequest.nonce,
		requireIdToken: true,
	});

	// Get the claims from the id_token
	const claims = oauth.getValidatedIdTokenClaims(result);
	if (!claims) {
		return c.text("Received invalid id_token from Auth0", 400);
	}

	// Complete the authorization
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: auth0AuthRequest.mcpAuthRequest,
		userId: claims.sub!,
		metadata: {
			label: claims.name || claims.email || claims.sub,
		},
		scope: auth0AuthRequest.mcpAuthRequest.scope,
		props: {
			claims: claims,
			tokenSet: {
				idToken: result.id_token,
				accessToken: result.access_token,
				refreshToken: result.refresh_token,
			},
		} as UserProps,
	});

	return Response.redirect(redirectTo);
}

/**
 * Renders the consent screen HTML
 */
function renderConsentScreen({
	clientName,
	clientLogo,
	clientUri,
	redirectUri,
	requestedScopes,
	transactionState,
	consentToken,
}: {
	clientName: string;
	clientLogo: string;
	clientUri: string;
	redirectUri: string;
	requestedScopes: string[];
	transactionState: string;
	consentToken: string;
}) {
	return html`
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Authorization Request</title>
                <style>
                    :root {
                        --primary-color: #4361ee;
                        --text-color: #333;
                        --background-color: #f7f7f7;
                        --card-background: #ffffff;
                        --border-color: #e0e0e0;
                        --danger-color: #ef233c;
                        --success-color: #2a9d8f;
                        --font-family:
                            -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue',
                            sans-serif;
                    }

                    body {
                        font-family: var(--font-family);
                        background-color: var(--background-color);
                        color: var(--text-color);
                        margin: 0;
                        padding: 0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                    }

                    .container {
                        width: 100%;
                        max-width: 480px;
                        padding: 20px;
                    }

                    .card {
                        background-color: var(--card-background);
                        border-radius: 12px;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                        padding: 32px;
                        overflow: hidden;
                    }

                    .header {
                        text-align: center;
                        margin-bottom: 24px;
                    }

                    .app-logo {
                        width: 80px;
                        height: 80px;
                        object-fit: contain;
                        border-radius: 8px;
                        margin-bottom: 16px;
                    }

                    h1 {
                        font-size: 20px;
                        margin: 0 0 8px 0;
                    }

                    .app-link {
                        color: var(--primary-color);
                        text-decoration: none;
                        font-size: 14px;
                    }

                    .app-link:hover {
                        text-decoration: underline;
                    }

                    .description {
                        margin: 24px 0;
                        font-size: 16px;
                        line-height: 1.5;
                    }

                    .scopes {
                        background-color: var(--background-color);
                        border-radius: 8px;
                        padding: 16px;
                        margin: 24px 0;
                    }

                    .scope-title {
                        font-weight: 600;
                        margin-bottom: 8px;
                        font-size: 15px;
                    }

                    .scope-list {
                        font-size: 14px;
                        margin: 0;
                        padding-left: 20px;
                    }

                    .actions {
                        display: flex;
                        gap: 12px;
                        margin-top: 24px;
                    }

                    .btn {
                        flex: 1;
                        padding: 12px 20px;
                        font-size: 16px;
                        font-weight: 500;
                        border-radius: 8px;
                        cursor: pointer;
                        border: none;
                        transition: all 0.2s ease;
                    }

                    .btn-cancel {
                        background-color: transparent;
                        border: 1px solid var(--border-color);
                        color: var(--text-color);
                    }

                    .btn-cancel:hover {
                        background-color: rgba(0, 0, 0, 0.05);
                    }

                    .btn-approve {
                        background-color: var(--primary-color);
                        color: white;
                    }

                    .btn-approve:hover {
                        background-color: #3250d2;
                    }

                    .security-note {
                        margin-top: 24px;
                        font-size: 12px;
                        color: #777;
                        text-align: center;
                    }

                    @media (max-width: 520px) {
                        .container {
                            padding: 10px;
                        }

                        .card {
                            padding: 24px;
                            border-radius: 8px;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="card">
                        <div class="header">
                            ${clientLogo?.length ? `<img src="${clientLogo}" alt="${clientName} logo" class="app-logo" />` : ""}
                            <h1>Todo MCP Server - Authorization Request</h1>
                            <a href="${clientUri}" target="_blank" rel="noopener noreferrer" class="app-link">${clientName}</a>
                        </div>

                        <p class="description">
                            <strong>${clientName}</strong> is requesting permission to access the <strong>Todo API</strong> using your
                            account. Please review the permissions before proceeding.
                        </p>

                        <p class="description">
                            By clicking "Allow Access", you authorize <strong>${clientName}</strong> to access the following resources:
                        </p>

                        <ul class="scope-list">
                            ${raw(requestedScopes.map((scope) => `<li>${scope}</li>`).join("\n"))}
                        </ul>

                        <p class="description">
                            If you did not initiate the request coming from <strong>${clientName}</strong> (<i>${redirectUri}</i>) or you do
                            not trust this application, you should deny access.
                        </p>

                        <form method="POST" action="/authorize/consent">
                            <input type="hidden" name="transaction_state" value="${transactionState}" />
                            <input type="hidden" name="consent_token" value="${consentToken}" />

                            <div class="actions">
                                <button type="submit" name="consent_action" value="deny" class="btn btn-cancel">Deny</button>
                                <button type="submit" name="consent_action" value="approve" class="btn btn-approve">Allow Access</button>
                            </div>
                        </form>

                        <p class="security-note">
                            You're signing in to a third-party application. Your account information is never shared without your
                            permission.
                        </p>
                    </div>
                </div>
            </body>
        </html>
    `;
}
