import { Buffer } from "node:buffer";
import type { AuthRequest, ClientInfo } from "@cloudflare/workers-oauth-provider"; // Adjust path if necessary

const COOKIE_NAME = "mcp-approved-clients";
const ONE_YEAR_IN_SECONDS = 31536000;

/**
 * Imports a secret key string for HMAC-SHA256 signing.
 */
async function importKey(secret: string): Promise<CryptoKey> {
	if (!secret) {
		throw new Error(
			"COOKIE_ENCRYPTION_KEY is not defined. A secret key is required for signing cookies.",
		);
	}
	return crypto.subtle.importKey(
		"raw",
		Buffer.from(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false, // not extractable
		["sign", "verify"], // key usages
	);
}

/**
 * Parses the signed cookie and verifies its integrity.
 */
async function getApprovedClientsFromCookie(
	cookieHeader: string | null,
	secret: string,
): Promise<string[] | null> {
	if (!cookieHeader) return null;

	const cookies = cookieHeader.split(";").map((c) => c.trim());
	const targetCookie = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));

	if (!targetCookie) return null;

	const cookieValue = targetCookie.substring(COOKIE_NAME.length + 1);
	const parts = cookieValue.split(".");

	if (parts.length !== 2) {
		console.warn("Invalid cookie format received.");
		return null; // Invalid format
	}

	const [signatureHex, base64Payload] = parts;
	const payload = Buffer.from(base64Payload, "base64url");

	const key = await importKey(secret);
	const isValid = await crypto.subtle.verify(
		"HMAC",
		key,
		Buffer.from(signatureHex, "hex"),
		payload,
	);

	if (!isValid) {
		console.warn("Cookie signature verification failed.");
		return null; // Signature invalid
	}

	try {
		const approvedClients = JSON.parse(payload.toString());
		if (!Array.isArray(approvedClients)) {
			console.warn("Cookie payload is not an array.");
			return null; // Payload isn't an array
		}
		// Ensure all elements are strings
		if (!approvedClients.every((item) => typeof item === "string")) {
			console.warn("Cookie payload contains non-string elements.");
			return null;
		}
		return approvedClients as string[];
	} catch (e) {
		console.error("Error parsing cookie payload:", e);
		return null; // JSON parsing failed
	}
}

/**
 * Checks if a given client ID has already been approved by the user,
 * based on a signed cookie.
 */
export async function clientIdAlreadyApproved(
	request: Request,
	clientId: string,
	cookieSecret: string,
): Promise<boolean> {
	if (!clientId) return false;
	const cookieHeader = request.headers.get("cookie");
	const approvedClients = await getApprovedClientsFromCookie(cookieHeader, cookieSecret);
	return approvedClients?.includes(clientId) ?? false;
}

/**
 * Configuration for the approval dialog
 */
export interface ApprovalDialogOptions {
	/**
	 * Client information to display in the approval dialog
	 */
	client: ClientInfo | null;
	/**
	 * Server information to display in the approval dialog
	 */
	server: {
		name: string;
		logo?: string;
		description?: string;
	};
	/**
	 * Arbitrary state data to pass through the approval flow
	 * Will be encoded in the form and returned when approval is complete
	 */
	state: Record<string, any>;
	/**
	 * Name of the cookie to use for storing approvals
	 * @default "mcp_approved_clients"
	 */
	cookieName?: string;
	/**
	 * Secret used to sign cookies for verification
	 * Can be a string or Uint8Array
	 * @default Built-in Uint8Array key
	 */
	cookieSecret?: string | Uint8Array;
	/**
	 * Cookie domain
	 * @default current domain
	 */
	cookieDomain?: string;
	/**
	 * Cookie path
	 * @default "/"
	 */
	cookiePath?: string;
	/**
	 * Cookie max age in seconds
	 * @default 30 days
	 */
	cookieMaxAge?: number;
}

/**
 * Renders an approval dialog for OAuth authorization
 * The dialog displays information about the client and server
 * and includes a form to submit approval
 *
 * @param request - The HTTP request
 * @param options - Configuration for the approval dialog
 * @returns A Response containing the HTML approval dialog
 */
export function renderApprovalDialog(request: Request, options: ApprovalDialogOptions): Response {
	const { client, server, state } = options;

	// Encode state for form submission
	const encodedState = Buffer.from(JSON.stringify(state)).toString("base64url");

	// Sanitize any untrusted content
	const serverName = sanitizeText(server.name);
	const clientName = client?.clientName ? sanitizeText(client.clientName) : "Unknown MCP Client";
	const serverDescription = server.description ? sanitizeText(server.description) : "";

	// Safe URLs
	const logoUrl = server.logo ? sanitizeUrl(server.logo) : "";
	const clientUri = client?.clientUri ? sanitizeUrl(client.clientUri) : "";
	const policyUri = client?.policyUri ? sanitizeUrl(client.policyUri) : "";
	const tosUri = client?.tosUri ? sanitizeUrl(client.tosUri) : "";

	// Client contacts
	const contacts =
		client?.contacts && client.contacts.length > 0
			? sanitizeText(client.contacts.join(", "))
			: "";

	// Get redirect URIs
	const redirectUris =
		client?.redirectUris && client.redirectUris.length > 0
			? client.redirectUris.map((uri) => sanitizeUrl(uri))
			: [];

	// Generate HTML for the approval dialog
	const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${clientName} | Authorization Request</title>
        <style>
          /* Modern, responsive styling with system fonts */
          :root {
            --primary-color: #0070f3;
            --error-color: #f44336;
            --border-color: #e5e7eb;
            --text-color: #333;
            --background-color: #fff;
            --card-shadow: 0 8px 36px 8px rgba(0, 0, 0, 0.1);
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                         Helvetica, Arial, sans-serif, "Apple Color Emoji",
                         "Segoe UI Emoji", "Segoe UI Symbol";
            line-height: 1.6;
            color: var(--text-color);
            background-color: #f9fafb;
            margin: 0;
            padding: 0;
          }

          .container {
            max-width: 600px;
            margin: 2rem auto;
            padding: 1rem;
          }

          .precard {
            padding: 2rem;
            text-align: center;
          }

          .card {
            background-color: var(--background-color);
            border-radius: 8px;
            box-shadow: var(--card-shadow);
            padding: 2rem;
          }

          .header {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 1.5rem;
          }

          .logo {
            width: 48px;
            height: 48px;
            margin-right: 1rem;
            border-radius: 8px;
            object-fit: contain;
          }

          .title {
            margin: 0;
            font-size: 1.3rem;
            font-weight: 400;
          }

          .alert {
            margin: 0;
            font-size: 1.5rem;
            font-weight: 400;
            margin: 1rem 0;
            text-align: center;
          }

          .description {
            color: #555;
          }

          .client-info {
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 1rem 1rem 0.5rem;
            margin-bottom: 1.5rem;
          }

          .client-name {
            font-weight: 600;
            font-size: 1.2rem;
            margin: 0 0 0.5rem 0;
          }

          .client-detail {
            display: flex;
            margin-bottom: 0.5rem;
            align-items: baseline;
          }

          .detail-label {
            font-weight: 500;
            min-width: 120px;
          }

          .detail-value {
            font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            word-break: break-all;
          }

          .detail-value a {
            color: inherit;
            text-decoration: underline;
          }

          .detail-value.small {
            font-size: 0.8em;
          }

          .external-link-icon {
            font-size: 0.75em;
            margin-left: 0.25rem;
            vertical-align: super;
          }

          .actions {
            display: flex;
            justify-content: flex-end;
            gap: 1rem;
            margin-top: 2rem;
          }

          .button {
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            font-size: 1rem;
          }

          .button-primary {
            background-color: var(--primary-color);
            color: white;
          }

          .button-secondary {
            background-color: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-color);
          }

          /* Responsive adjustments */
          @media (max-width: 640px) {
            .container {
              margin: 1rem auto;
              padding: 0.5rem;
            }

            .card {
              padding: 1.5rem;
            }

            .client-detail {
              flex-direction: column;
            }

            .detail-label {
              min-width: unset;
              margin-bottom: 0.25rem;
            }

            .actions {
              flex-direction: column;
            }

            .button {
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="precard">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${serverName} Logo" class="logo">` : ""}
            <h1 class="title"><strong>${serverName}</strong></h1>
            </div>

            ${serverDescription ? `<p class="description">${serverDescription}</p>` : ""}
          </div>

          <div class="card">

            <h2 class="alert"><strong>${clientName || "A new MCP Client"}</strong> is requesting access</h1>

            <div class="client-info">
              <div class="client-detail">
                <div class="detail-label">Name:</div>
                <div class="detail-value">
                  ${clientName}
                </div>
              </div>

              ${
					clientUri
						? `
                <div class="client-detail">
                  <div class="detail-label">Website:</div>
                  <div class="detail-value small">
                    <a href="${clientUri}" target="_blank" rel="noopener noreferrer">
                      ${clientUri}
                    </a>
                  </div>
                </div>
              `
						: ""
				}

              ${
					policyUri
						? `
                <div class="client-detail">
                  <div class="detail-label">Privacy Policy:</div>
                  <div class="detail-value">
                    <a href="${policyUri}" target="_blank" rel="noopener noreferrer">
                      ${policyUri}
                    </a>
                  </div>
                </div>
              `
						: ""
				}

              ${
					tosUri
						? `
                <div class="client-detail">
                  <div class="detail-label">Terms of Service:</div>
                  <div class="detail-value">
                    <a href="${tosUri}" target="_blank" rel="noopener noreferrer">
                      ${tosUri}
                    </a>
                  </div>
                </div>
              `
						: ""
				}

              ${
					redirectUris.length > 0
						? `
                <div class="client-detail">
                  <div class="detail-label">Redirect URIs:</div>
                  <div class="detail-value small">
                    ${redirectUris.map((uri) => `<div>${uri}</div>`).join("")}
                  </div>
                </div>
              `
						: ""
				}

              ${
					contacts
						? `
                <div class="client-detail">
                  <div class="detail-label">Contact:</div>
                  <div class="detail-value">${contacts}</div>
                </div>
              `
						: ""
				}
            </div>

            <p>This MCP Client is requesting to be authorized on ${serverName}. If you approve, you will be redirected to complete authentication.</p>

            <form method="post" action="${new URL(request.url).pathname}">
              <input type="hidden" name="state" value="${encodedState}">

              <div class="actions">
                <button type="button" class="button button-secondary" onclick="window.history.back()">Cancel</button>
                <button type="submit" class="button button-primary">Approve</button>
              </div>
            </form>
          </div>
        </div>
      </body>
    </html>
  `;

	return new Response(htmlContent, {
		headers: {
			"content-type": "text/html; charset=utf-8",
		},
	});
}

/**
 * Result of parsing the approval form submission.
 */
export interface ParsedApprovalResult {
	/** The original state object passed through the form. */
	state: any;
	/** Headers to set on the redirect response, including the Set-Cookie header. */
	headers: Record<string, string>;
}

/**
 * Parses the form submission from the approval dialog, extracts the state,
 * and generates Set-Cookie headers to mark the client as approved.
 */
export async function parseRedirectApproval(
	request: Request,
	cookieSecret: string,
): Promise<ParsedApprovalResult> {
	if (request.method !== "POST") {
		throw new Error("Invalid request method. Expected POST.");
	}

	let state: any;
	let clientId: string | undefined;

	try {
		const formData = await request.formData();
		const encodedState = formData.get("state");

		if (typeof encodedState !== "string" || !encodedState) {
			throw new Error("Missing or invalid 'state' in form data.");
		}

		state = JSON.parse(Buffer.from(encodedState, "base64url").toString()) as {
			oauthReqInfo?: AuthRequest;
		}; // Decode the state
		clientId = state?.oauthReqInfo?.clientId; // Extract clientId from within the state

		if (!clientId) {
			throw new Error("Could not extract clientId from state object.");
		}
	} catch (e) {
		console.error("Error processing form submission:", e);
		// Rethrow or handle as appropriate, maybe return a specific error response
		throw new Error(
			`Failed to parse approval form: ${e instanceof Error ? e.message : String(e)}`,
		);
	}

	// Get existing approved clients
	const cookieHeader = request.headers.get("cookie");
	const existingApprovedClients =
		(await getApprovedClientsFromCookie(cookieHeader, cookieSecret)) || [];

	// Add the newly approved client ID (avoid duplicates)
	const updatedApprovedClients = Array.from(new Set([...existingApprovedClients, clientId]));

	// Sign the updated list
	const payload = Buffer.from(JSON.stringify(updatedApprovedClients));
	const key = await importKey(cookieSecret);
	const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, payload));
	const newCookieValue = `${signature.toString("hex")}.${payload.toString("base64url")}`;

	// Generate Set-Cookie header
	const headers: Record<string, string> = {
		"set-cookie": `${COOKIE_NAME}=${newCookieValue}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${ONE_YEAR_IN_SECONDS}`,
	};

	return { headers, state };
}

/**
 * Constructs an authorization URL for an upstream service.
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
}): string {
	const upstream = new URL(upstream_url);
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("scope", scope);
	if (state) upstream.searchParams.set("state", state);
	upstream.searchParams.set("response_type", "code");
	return upstream.href;
}

/**
 * Fetches an authorization token from an upstream service.
 */
export async function fetchUpstreamAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	upstream_url,
}: {
	code: string | undefined;
	upstream_url: string;
	client_secret: string;
	redirect_uri: string;
	client_id: string;
}): Promise<[string, string, null] | [null, null, Response]> {
	if (!code) {
		return [null, null, new Response("Missing code", { status: 400 })];
	}
	const data = {
		client_id,
		client_secret,
		code,
		grant_type: "authorization_code",
		redirect_uri,
	};
	const resp = await fetch(upstream_url, {
		body: new URLSearchParams(data).toString(),
		headers: {
			"content-type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});
	if (!resp.ok) {
		console.log(await resp.text());
		return [
			null,
			null,
			new Response(`Failed to exchange code ${resp.status}`, { status: 500 }),
		];
	}
	const body = (await resp.json()) as any;

	const accessToken = body.access_token as string;
	if (!accessToken) {
		return [null, null, new Response("Missing access token", { status: 400 })];
	}

	const idToken = body.id_token as string;
	if (!idToken) {
		return [null, null, new Response("Missing id token", { status: 400 })];
	}
	return [accessToken, idToken, null];
}

/**
 * Sanitizes text to prevent XSS attacks by escaping HTML characters.
 */
function sanitizeText(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function sanitizeUrl(raw: string): string {
	const abort = () => {
		throw new Error(`Invalid url to pass to open(): ${raw}`);
	};
	let url!: URL;
	try {
		url = new URL(raw);
	} catch (_) {
		abort();
	}

	// Don't allow any other scheme than http(s)
	if (url.protocol !== "https:" && url.protocol !== "http:") abort();
	// Hostnames can't be updated, but let's reject if they contain anything suspicious
	if (url.hostname !== encodeURIComponent(url.hostname)) abort();

	// Forcibly sanitise all the pieces of the URL
	if (url.username) url.username = encodeURIComponent(url.username);
	if (url.password) url.password = encodeURIComponent(url.password);
	url.pathname =
		url.pathname.slice(0, 1) +
		encodeURIComponent(url.pathname.slice(1)).replace(/%2f/gi, "/");
	url.search =
		url.search.slice(0, 1) +
		Array.from(url.searchParams.entries()).map(sanitizeParam).join("&");
	url.hash = url.hash.slice(0, 1) + encodeURIComponent(url.hash.slice(1));
	return url.href;
}

function sanitizeParam([k, v]: [string, string]): string {
	return `${encodeURIComponent(k)}${v.length > 0 ? `=${encodeURIComponent(v)}` : ""}`;
}

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
	login: string;
	name: string;
	email: string;
	accessToken: string;
};
