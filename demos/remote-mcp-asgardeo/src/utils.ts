import { TokenSet } from "./types";

export function getAuthorizeRequestUrl({
  authorize_ep,
  client_id,
  scope,
  redirect_uri,
  state,
  code_challenge,
  code_challenge_method = "S256",
}: {
  authorize_ep: string;
  client_id: string;
  scope: string;
  redirect_uri: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}) {
  const authorizeRequest = new URL(authorize_ep);
  authorizeRequest.searchParams.set("client_id", client_id);
  authorizeRequest.searchParams.set("redirect_uri", redirect_uri);
  authorizeRequest.searchParams.set("scope", scope);
  if (state) authorizeRequest.searchParams.set("state", state);
  authorizeRequest.searchParams.set("response_type", "code");
  if (code_challenge) {
    authorizeRequest.searchParams.set("code_challenge", code_challenge);
    authorizeRequest.searchParams.set("code_challenge_method", code_challenge_method!);
  }
  return authorizeRequest.href;
}

export async function fetchAuthToken({
  token_ep,
  client_id,
  client_secret,
  code,
  redirect_uri,
  grant_type,
  code_verifier,
}: {
  token_ep: string;
  client_id: string;
  client_secret: string;
  code: string | undefined;
  redirect_uri: string;
  grant_type: string;
  code_verifier?: string;
}): Promise<[TokenSet, null] | [null, Response]> {
  if (!code) {
    return [null, new Response("Missing code", { status: 400 })];
  }

  const bodyParams: Record<string, string> = {
    client_id,
    code,
    grant_type,
    redirect_uri,
    ...(code_verifier && { code_verifier }),
  };

  const basicAuth = "Basic " + btoa(`${client_id}:${client_secret}`);
  const resp = await fetch(token_ep, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": basicAuth,
    },
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!resp.ok) {
    return [null, new Response("Failed to fetch access token", { status: 500 })];
  }

  const tokenSet = await resp.json() as TokenSet;
  if (!tokenSet.access_token) {
    return [null, new Response("Missing access token", { status: 400 })];
  }
  return [tokenSet, null];
}

export async function fetchAuthTokenFromRefreshToken({
  token_ep,
  client_id,
  client_secret,
  refresh_token,
  grant_type,
}: {
  token_ep: string;
  client_id: string;
  client_secret: string;
  refresh_token: string | undefined;
  grant_type: string;
}): Promise<[TokenSet, null] | [null, Response]> {
  if (!refresh_token) {
    return [null, new Response("Missing Asgardeo refresh token", { status: 400 })];
  }

  const bodyParams: Record<string, string> = {
    client_id,
    refresh_token,
    grant_type,
  };

  const basicAuth = "Basic " + btoa(`${client_id}:${client_secret}`);
  const resp = await fetch(token_ep, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": basicAuth,
    },
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!resp.ok) {
    return [null, new Response("Failed to fetch access token", { status: 500 })];
  }

  const tokenSet = await resp.json() as TokenSet;
  if (!tokenSet.access_token) {
    return [null, new Response("Missing access token", { status: 400 })];
  }
  return [tokenSet, null];
}

export async function verifyIdToken(
  idToken: string,
  jwksUri: string,
  issuer: string,
  audience: string
): Promise<any | Response> {
  try {
    const [headerB64, payloadB64, signatureB64] = idToken.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) {
      return new Response("Malformed ID Token", { status: 400 });
    }
    const header = JSON.parse(atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')));
    const kid = header.kid;
    const res = await fetch(jwksUri);
    if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.statusText}`);
    const jwksRaw = await res.json();
    const keys = (jwksRaw && typeof jwksRaw === 'object' && Array.isArray((jwksRaw as any).keys)) ? (jwksRaw as any).keys : undefined;
    if (!keys) {
      return new Response("Invalid JWKS format", { status: 400 });
    }
    const jwk = keys.find((k: any) => k.kid === kid);
    if (!jwk) {
      return new Response("JWK not found for kid", { status: 400 });
    }
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature,
      encoder.encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) {
      return new Response("ID Token signature invalid", { status: 400 });
    }
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    if (payload.iss !== issuer || payload.aud !== audience) {
      return new Response("Issuer or audience mismatch", { status: 400 });
    }
    return payload;
  } catch (err) {
    console.error('ID Token verification failed:', err);
    return new Response("ID Token verification failed", { status: 400 });
  }
}

export async function generateVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateRandomState(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function getAuthData() {
  const codeVerifier = await generateVerifier();
  const codeChallenge = await generateChallenge(codeVerifier);
  const authData = { codeVerifier, codeChallenge };
  return authData;
}
