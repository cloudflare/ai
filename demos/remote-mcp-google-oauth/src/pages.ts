import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";

export const SERVER_NAME = "Amat Odoo MCP";

// No scripts, no external resources, no framing.
const PAGE_CSP =
	"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'";

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function layout(title: string, body: string): string {
	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f6f7f9; color: #1f2328; margin: 0; }
main { max-width: 560px; margin: 3rem auto; padding: 2rem; background: #fff; border-radius: 8px; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); }
h1 { font-size: 1.3rem; margin-top: 0; }
.warning { background: #fff4e5; border: 1px solid #f0b46a; border-radius: 6px; padding: 0.75rem; }
.actions { display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; }
button, .link { font-size: 1rem; padding: 0.6rem 1.2rem; border-radius: 6px; cursor: pointer; text-decoration: none; }
.primary { background: #0b5fff; border: none; color: #fff; }
.secondary { background: transparent; border: 1px solid #c8ccd1; color: #1f2328; }
@media (max-width: 600px) { main { margin: 0; border-radius: 0; } .actions { flex-direction: column; } }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function htmlHeaders(headers: Headers = new Headers()): Headers {
	headers.set("Content-Type", "text/html; charset=utf-8");
	headers.set("Content-Security-Policy", PAGE_CSP);
	headers.set("X-Frame-Options", "DENY");
	headers.set("Cache-Control", "no-store");
	headers.set("Referrer-Policy", "no-referrer");
	return headers;
}

/**
 * The consent page. Every string from `details` comes from the client's registration and is
 * escaped. The form carries only the library's one-time handle, never the request itself.
 * `headers` are the ones `beginConsent()` returned: they bind the handle to this browser.
 */
export function renderConsentPage(
	details: ConsentDescription,
	handle: string,
	headers: Headers,
): Response {
	const clientName = escapeHtml(details.clientName);
	const scopes =
		details.scope.length > 0
			? `<p>Permissions demandées : ${details.scope.map(escapeHtml).join(", ")}</p>`
			: "";
	const loopback = details.redirectIsLoopback
		? `<p class="warning"><strong>L'accès sera envoyé à une application sur cet ordinateur.</strong> Continuez seulement si vous venez de lancer la connexion depuis celle-ci.</p>`
		: "";
	const body = `<h1>${escapeHtml(SERVER_NAME)}</h1>
<p><strong>${clientName}</strong> demande l'accès en lecture seule aux données Odoo d'Amat.</p>
<p>L'accès sera envoyé à <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${loopback}
${scopes}
<p class="warning"><strong>Continuez seulement si vous venez vous-même de cliquer sur « Connecter » dans Claude.</strong> Si quelqu'un vous a envoyé ce lien, cliquez sur Refuser : autoriser donnerait à cette personne l'accès aux données avec votre compte.</p>
<p>Vous serez ensuite redirigé vers Google. Seuls les comptes autorisés peuvent terminer la connexion.</p>
<form method="post" action="/authorize">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
<div class="actions">
<button type="submit" name="decision" value="deny" class="secondary">Refuser</button>
<button type="submit" name="decision" value="approve" class="primary">Autoriser</button>
</div>
</form>`;
	return new Response(layout(`Autoriser ${details.clientName}`, body), {
		headers: htmlHeaders(headers),
	});
}

/**
 * A page that ends the flow locally. `link`, when given, must be a URL the library
 * validated (for example an error redirect built from a stored authorization request).
 */
export function renderMessagePage(
	status: number,
	title: string,
	message: string,
	options: { headers?: Headers; link?: { href: string; label: string } } = {},
): Response {
	const link = options.link
		? `<div class="actions"><a class="link secondary" href="${escapeHtml(options.link.href)}">${escapeHtml(options.link.label)}</a></div>`
		: "";
	const body = `<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
${link}`;
	return new Response(layout(title, body), {
		headers: htmlHeaders(options.headers),
		status,
	});
}
