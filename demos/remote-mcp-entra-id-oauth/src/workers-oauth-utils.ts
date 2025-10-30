// This file is copied from the GitHub/Google implementations
// It handles approval dialogs and cookie-based client approval tracking

import type { AuthRequest, ClientInfo } from "@cloudflare/workers-oauth-provider";

const COOKIE_NAME = "mcp-approved-clients";
const ONE_YEAR_IN_SECONDS = 31536000;

// --- Helper Functions ---

/**
 * Encodes arbitrary data to a URL-safe base64 string.
 */
function _encodeState(data: any): string {
	try {
		const jsonString = JSON.stringify(data);
		return btoa(jsonString);
	} catch (e) {
		console.error("Error encoding state:", e);
		throw new Error("Could not encode state");
	}
}

/**
 * Decodes a URL-safe base64 string back to its original data.
 */
function decodeState<T = any>(encoded: string): T {
	try {
		const jsonString = atob(encoded);
		return JSON.parse(jsonString);
	} catch (e) {
		console.error("Error decoding state:", e);
		throw new Error("Could not decode state");
	}
}

/**
 * Imports a secret key string for HMAC-SHA256 signing.
 */
async function importKey(secret: string): Promise<CryptoKey> {
	if (!secret) {
		throw new Error(
			"COOKIE_SECRET is not defined. A secret key is required for signing cookies.",
		);
	}
	const enc = new TextEncoder();
	return crypto.subtle.importKey(
		"raw",
		enc.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign", "verify"],
	);
}

/**
 * Signs data using HMAC-SHA256.
 */
async function signData(key: CryptoKey, data: string): Promise<string> {
	const enc = new TextEncoder();
	const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(data));
	return Array.from(new Uint8Array(signatureBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Verifies an HMAC-SHA256 signature.
 */
async function verifySignature(
	key: CryptoKey,
	signatureHex: string,
	data: string,
): Promise<boolean> {
	const enc = new TextEncoder();
	try {
		const signatureBytes = new Uint8Array(
			signatureHex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)),
		);
		return await crypto.subtle.verify("HMAC", key, signatureBytes.buffer, enc.encode(data));
	} catch (e) {
		console.error("Error verifying signature:", e);
		return false;
	}
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
		return null;
	}

	const [signatureHex, base64Payload] = parts;
	const payload = atob(base64Payload);

	const key = await importKey(secret);
	const isValid = await verifySignature(key, signatureHex, payload);

	if (!isValid) {
		console.warn("Cookie signature verification failed.");
		return null;
	}

	try {
		const approvedClients = JSON.parse(payload);
		if (!Array.isArray(approvedClients)) {
			console.warn("Cookie payload is not an array.");
			return null;
		}
		if (!approvedClients.every((item) => typeof item === "string")) {
			console.warn("Cookie payload contains non-string elements.");
			return null;
		}
		return approvedClients as string[];
	} catch (e) {
		console.error("Error parsing cookie payload:", e);
		return null;
	}
}

// --- Exported Functions ---

/**
 * Checks if a given client ID has already been approved by the user.
 */
export async function clientIdAlreadyApproved(
	request: Request,
	clientId: string,
	cookieSecret: string,
): Promise<boolean> {
	if (!clientId) return false;
	const cookieHeader = request.headers.get("Cookie");
	const approvedClients = await getApprovedClientsFromCookie(cookieHeader, cookieSecret);
	return approvedClients?.includes(clientId) ?? false;
}

/**
 * Configuration for the approval dialog
 */
export interface ApprovalDialogOptions {
	client: ClientInfo | null;
	server: {
		name: string;
		logo?: string;
		description?: string;
	};
	state: Record<string, any>;
}

/**
 * Renders an approval dialog for OAuth authorization
 */
export function renderApprovalDialog(request: Request, options: ApprovalDialogOptions): Response {
	const { client, server, state } = options;
	const encodedState = btoa(JSON.stringify(state));

	const serverName = sanitizeHtml(server.name);
	const clientName = client?.clientName ? sanitizeHtml(client.clientName) : "Unknown MCP Client";
	const serverDescription = server.description ? sanitizeHtml(server.description) : "";
	const logoUrl = server.logo ? sanitizeHtml(server.logo) : "";

	const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${clientName} | Authorization Request</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9fafb;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 2rem auto;
            padding: 1rem;
          }
          .card {
            background-color: #fff;
            border-radius: 8px;
            box-shadow: 0 8px 36px 8px rgba(0, 0, 0, 0.1);
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
          }
          .title {
            margin: 0;
            font-size: 1.5rem;
          }
          .alert {
            font-size: 1.2rem;
            margin: 1rem 0;
            text-align: center;
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
            background-color: #0070f3;
            color: white;
          }
          .button-secondary {
            background-color: transparent;
            border: 1px solid #e5e7eb;
            color: #333;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${serverName} Logo" class="logo">` : ""}
              <h1 class="title">${serverName}</h1>
            </div>
            ${serverDescription ? `<p>${serverDescription}</p>` : ""}
            <h2 class="alert"><strong>${clientName}</strong> is requesting access</h2>
            <p>This MCP Client is requesting to be authorized. If you approve, you will be redirected to Microsoft to sign in.</p>
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
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

/**
 * Result of parsing the approval form submission.
 */
export interface ParsedApprovalResult {
	state: any;
	headers: Record<string, string>;
}

/**
 * Parses the form submission from the approval dialog.
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

		state = decodeState<{ oauthReqInfo?: AuthRequest }>(encodedState);
		clientId = state?.oauthReqInfo?.clientId;

		if (!clientId) {
			throw new Error("Could not extract clientId from state object.");
		}
	} catch (e) {
		console.error("Error processing form submission:", e);
		throw new Error(
			`Failed to parse approval form: ${e instanceof Error ? e.message : String(e)}`,
		);
	}

	const cookieHeader = request.headers.get("Cookie");
	const existingApprovedClients =
		(await getApprovedClientsFromCookie(cookieHeader, cookieSecret)) || [];

	const updatedApprovedClients = Array.from(new Set([...existingApprovedClients, clientId]));

	const payload = JSON.stringify(updatedApprovedClients);
	const key = await importKey(cookieSecret);
	const signature = await signData(key, payload);
	const newCookieValue = `${signature}.${btoa(payload)}`;

	const headers: Record<string, string> = {
		"Set-Cookie": `${COOKIE_NAME}=${newCookieValue}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${ONE_YEAR_IN_SECONDS}`,
	};

	return { headers, state };
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 */
function sanitizeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
