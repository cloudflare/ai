import {
	type AuthRequest,
	AuthorizationError,
	authorizationErrorRedirect,
	type OAuthHelpers,
	type ResumedUpstream,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { isAllowedEmail, isAllowedRedirectUri, normalizeEmail } from "./access";
import { renderConsentPage, renderMessagePage } from "./pages";
import {
	createPkcePair,
	exchangeCodeForAccessToken,
	fetchGoogleUser,
	getUpstreamAuthorizeUrl,
	type Props,
	readBody,
} from "./utils";

/**
 * The authorization flow, built on the OAuth provider's consent and upstream helpers:
 *
 *   GET  /authorize  parseAuthRequest() validates the client, redirect URI, PKCE and resource;
 *                    the redirect URI must also be Claude's. beginConsent() shows the page.
 *   POST /authorize  approveConsent() recovers the request from storage (never from the form)
 *                    after checking the browser-bound, single-use handle; beginUpstream()
 *                    stores it again under a browser-bound, single-use `state` for Google.
 *   GET  /callback   finishUpstream() recovers it; the code is exchanged with PKCE, and the
 *                    Google account must be verified and allowlisted before
 *                    completeAuthorization() issues anything to the MCP client.
 */

type Bindings = Env & { OAUTH_PROVIDER: OAuthHelpers };

// The consent form only carries a handle and a decision.
const MAX_FORM_BYTES = 4096;

const app = new Hono<{ Bindings: Bindings }>();

function missingConfig(env: Env): string[] {
	const missing: string[] = [];
	if (!env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
	if (!env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
	return missing;
}

app.use("*", async (c, next) => {
	const missing = missingConfig(c.env);
	if (missing.length > 0) {
		console.error("oauth_misconfigured", { missing });
		return renderMessagePage(
			500,
			"Service indisponible",
			"Le serveur d'autorisation n'est pas configuré. Contactez l'administrateur.",
		);
	}
	await next();
});

// Registered with Google as the OAuth redirect URI. Derived from the configured public URL,
// not from the request, so it always matches the Google Cloud configuration.
function googleCallbackUrl(env: Env): string {
	return new URL("/callback", env.MCP_RESOURCE).href;
}

function clientNotAllowed(headers?: Headers): Response {
	return renderMessagePage(
		400,
		"Client non autorisé",
		"Seul le connecteur Claude peut se connecter à ce serveur MCP.",
		{ headers },
	);
}

/**
 * Validation failures from the library. A redirect back to the client is used only when the
 * library validated its redirect URI and it is one of Claude's; everything else is rendered here.
 */
function authorizationFailure(error: unknown): Response {
	if (!(error instanceof AuthorizationError)) throw error;
	console.warn("authorize_failed", { code: error.code, description: error.description });
	if (error.redirectTo && isAllowedRedirectUri(error.redirectUri)) {
		return new Response(null, {
			headers: { "Cache-Control": "no-store", Location: error.redirectTo },
			status: 302,
		});
	}
	return renderMessagePage(
		400,
		"Autorisation impossible",
		`${error.description} — Recommencez la connexion depuis Claude.`,
	);
}

async function redirectToGoogle(
	env: Bindings,
	authRequest: AuthRequest,
	headers?: Headers,
): Promise<Response> {
	const { verifier, challenge } = await createPkcePair();
	const upstream = await env.OAUTH_PROVIDER.beginUpstream(authRequest, {
		data: { codeVerifier: verifier },
		headers,
	});
	upstream.headers.set(
		"Location",
		getUpstreamAuthorizeUrl({
			clientId: env.GOOGLE_CLIENT_ID,
			codeChallenge: challenge,
			redirectUri: googleCallbackUrl(env),
			state: upstream.state,
		}),
	);
	return new Response(null, { headers: upstream.headers, status: 302 });
}

app.get("/authorize", async (c) => {
	const oauth = c.env.OAUTH_PROVIDER;
	let authRequest: AuthRequest;
	try {
		authRequest = await oauth.parseAuthRequest(c.req.raw);
	} catch (error) {
		return authorizationFailure(error);
	}

	if (!isAllowedRedirectUri(authRequest.redirectUri)) {
		console.warn("authorize_rejected", {
			clientId: authRequest.clientId,
			reason: "redirect_uri_not_allowed",
		});
		return clientNotAllowed();
	}

	// Consent is asked on every authorization, never remembered: a remembered approval would
	// let an authorization link forwarded to an allowed user skip straight to Google.
	const details = await oauth.describeConsent(authRequest);
	const consent = await oauth.beginConsent(authRequest);
	return renderConsentPage(details, consent.handle, consent.headers);
});

app.post("/authorize", async (c) => {
	const oauth = c.env.OAUTH_PROVIDER;
	const contentType = (c.req.header("content-type") ?? "").toLowerCase();
	if (!contentType.startsWith("application/x-www-form-urlencoded")) {
		return renderMessagePage(400, "Requête invalide", "Le formulaire est invalide.");
	}
	const read = await readBody(c.req.raw, MAX_FORM_BYTES);
	if ("error" in read) {
		return read.error === "too_large"
			? renderMessagePage(413, "Requête invalide", "Le formulaire est trop volumineux.")
			: renderMessagePage(400, "Requête invalide", "Le formulaire est invalide.");
	}
	const form = new URLSearchParams(read.text);
	const handle = form.get("handle");
	if (typeof handle !== "string" || handle.length === 0) {
		return renderMessagePage(400, "Requête invalide", "Le formulaire est incomplet.");
	}

	try {
		if (form.get("decision") !== "approve") {
			const denied = await oauth.denyConsent(c.req.raw, handle);
			return new Response(null, { headers: denied.headers, status: 302 });
		}
		const approved = await oauth.approveConsent(c.req.raw, handle);
		if (!isAllowedRedirectUri(approved.request.redirectUri)) {
			return clientNotAllowed(approved.headers);
		}
		return await redirectToGoogle(c.env, approved.request, approved.headers);
	} catch (error) {
		return authorizationFailure(error);
	}
});

app.get("/callback", async (c) => {
	const oauth = c.env.OAUTH_PROVIDER;
	let resumed: ResumedUpstream<{ codeVerifier?: unknown }>;
	try {
		resumed = await oauth.finishUpstream<{ codeVerifier?: unknown }>(c.req.raw);
	} catch (error) {
		return authorizationFailure(error);
	}
	const { request: authRequest, data, headers } = resumed;
	if (!isAllowedRedirectUri(authRequest.redirectUri)) {
		return clientNotAllowed(headers);
	}

	const params = new URL(c.req.url).searchParams;
	if (params.has("error")) {
		// The user cancelled at Google, or Google refused the sign-in.
		headers.set(
			"Location",
			authorizationErrorRedirect(
				authRequest,
				"access_denied",
				"Google sign-in did not complete",
			),
		);
		return new Response(null, { headers, status: 302 });
	}

	const code = params.get("code");
	const codeVerifier = data?.codeVerifier;
	if (!code || typeof codeVerifier !== "string") {
		return renderMessagePage(400, "Requête invalide", "La réponse de Google est incomplète.", {
			headers,
		});
	}

	const googleAccessToken = await exchangeCodeForAccessToken({
		clientId: c.env.GOOGLE_CLIENT_ID,
		clientSecret: c.env.GOOGLE_CLIENT_SECRET,
		code,
		codeVerifier,
		redirectUri: googleCallbackUrl(c.env),
	});
	const user = googleAccessToken ? await fetchGoogleUser(googleAccessToken) : null;
	if (!user) {
		return renderMessagePage(
			502,
			"Échec de la connexion Google",
			"Google n'a pas pu confirmer votre identité. Recommencez la connexion depuis Claude.",
			{ headers },
		);
	}

	// The allowlist decision is taken here, before any grant or code exists.
	const email = normalizeEmail(user.email);
	if (!user.emailVerified || !isAllowedEmail(email)) {
		console.warn("login_denied", {
			email,
			reason: !user.emailVerified ? "email_not_verified" : "email_not_allowed",
		});
		return renderMessagePage(
			403,
			"Accès refusé",
			`Le compte Google ${email || "utilisé"} n'est pas autorisé à accéder à ce serveur MCP.`,
			{
				headers,
				link: {
					href: authorizationErrorRedirect(
						authRequest,
						"access_denied",
						"This Google account is not authorized",
					),
					label: "Retourner à Claude",
				},
			},
		);
	}

	const props: Props = { email, name: user.name, sub: user.sub };
	const { redirectTo } = await oauth.completeAuthorization({
		metadata: { label: email },
		props,
		request: authRequest,
		scope: authRequest.scope,
		userId: user.sub,
	});
	console.log("login_granted", { clientId: authRequest.clientId, email });
	headers.set("Location", redirectTo);
	return new Response(null, { headers, status: 302 });
});

app.onError((error) => {
	console.error("oauth_handler_error", {
		message: error.message.slice(0, 200),
		name: error.name,
	});
	return renderMessagePage(
		500,
		"Erreur interne",
		"Une erreur inattendue s'est produite. Recommencez la connexion depuis Claude.",
	);
});

export { app as GoogleHandler };
