/**
 * Server-side access policy. Changing either list requires a commit and a deploy,
 * so every change to who can reach the Amat MCP server is reviewed and auditable.
 */

// The only Google accounts allowed to obtain an MCP token. Compared after normalizeEmail().
export const ALLOWED_EMAILS: ReadonlySet<string> = new Set([
	"bangaly@nasta-univers.com",
	"aissata@nasta-univers.com",
	"talby@nasta-univers.com",
]);

// Claude's OAuth callbacks for remote MCP connectors. An authorization request whose
// redirect_uri is not listed here is refused before any consent or Google redirect,
// so a client registered through /register cannot obtain a token for itself.
export const ALLOWED_REDIRECT_URIS: ReadonlySet<string> = new Set([
	"https://claude.ai/api/mcp/auth_callback",
	"https://claude.com/api/mcp/auth_callback",
]);

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function isAllowedEmail(email: unknown): boolean {
	return typeof email === "string" && ALLOWED_EMAILS.has(normalizeEmail(email));
}

export function isAllowedRedirectUri(redirectUri: unknown): boolean {
	return typeof redirectUri === "string" && ALLOWED_REDIRECT_URIS.has(redirectUri);
}
