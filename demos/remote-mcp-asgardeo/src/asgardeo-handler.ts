import { Hono, Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { env } from "cloudflare:workers";

import * as oauth from "./utils";
import {
  clientIdAlreadyApproved,
  parseRedirectApproval,
  renderApprovalDialog,
} from "./workers-oauth-utils";

import type { Env, Props, AuthData } from "./types";
import type {
  AuthRequest,
  OAuthHelpers,
  TokenExchangeCallbackOptions,
  TokenExchangeCallbackResult,
} from "@cloudflare/workers-oauth-provider";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get(
  "/authorize",
  async (c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) => {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    const { clientId } = oauthReqInfo;
    if (!clientId) {
      return c.text("Invalid request", 400);
    }

    const base_url: string = c.env.ASGARDEO_BASE_URL;
    if (!base_url) {
      return c.text("Missing ASGARDEO_BASE_URL", 400);
    }
    const authorize_ep: string = `${base_url}/oauth2/authorize`;
    const scope: string = c.env.ASGARDEO_SCOPE;
    const authData = await oauth.getAuthData();
    setCookie(c, "asgardeo_req_default", btoa(JSON.stringify(authData)), {
      path: "/",
      httpOnly: true,
      /**
       * IMPORTANT NOTE: This is only for development environments. 
       * For production environments:
       * - Set secure: true to ensure cookies are only sent over HTTPS
       * - Consider using sameSite: "strict" for better CSRF protection
       */
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 1, // 1 hour
    });

    if (
      await clientIdAlreadyApproved(
        c.req.raw,
        clientId,
        env.COOKIE_ENCRYPTION_KEY
      )
    ) {
      return redirectTogetAuthorizeEP(
        c.req.raw,
        authorize_ep,
        scope,
        oauthReqInfo,
        authData.codeChallenge
      );
    }

    return c.html(
      await renderApprovalDialog(c.req.raw, {
        client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
        server: {
          name: "Cloudflare Asgardeo MCP Server",
          logo: "https://authjs.dev/img/providers/asgardeo.svg",
          description:
            "This is a demo MCP Remote Server using Asgardeo for authentication.",
        },
        state: { oauthReqInfo },
      })
    );
  }
);

app.post("/authorize", async (c) => {
  // Validate form submission, extract state, and generate Set-Cookie headers to skip approval dialog next time
  const { state, headers } = await parseRedirectApproval(
    c.req.raw,
    env.COOKIE_ENCRYPTION_KEY
  );
  if (!state.oauthReqInfo) {
    return c.text("Invalid request", 400);
  }

  const base_url: string = c.env.ASGARDEO_BASE_URL;
  if (!base_url) {
    return c.text("Missing ASGARDEO_BASE_URL", 400);
  }

  const authorize_ep: string = `${base_url}/oauth2/authorize`;
  const scope: string = c.env.ASGARDEO_SCOPE;
  const cookieValue = getCookie(c, "asgardeo_req_default");
  const authData = JSON.parse(atob(cookieValue!)) as AuthData;

  return redirectTogetAuthorizeEP(
    c.req.raw,
    authorize_ep,
    scope,
    state.oauthReqInfo,
    authData.codeChallenge
  );
});

async function redirectTogetAuthorizeEP(
  request: Request,
  authorize_ep: string,
  scope: string,
  oauthReqInfo: AuthRequest,
  code_challenge: string,
  headers: Record<string, string> = {}
) {
  const location = oauth.getAuthorizeRequestUrl({
    authorize_ep: authorize_ep,
    scope: scope,
    client_id: env.ASGARDEO_CLIENT_ID,
    redirect_uri: new URL("/callback", request.url).href,
    state: btoa(JSON.stringify(oauthReqInfo)),
    code_challenge: code_challenge,
  });

  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location,
    },
  });
}


app.get(
  "/callback",
  async (c: Context<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>) => {
    // Get the oauthReqInfo out of state param
    const stateParam = c.req.query("state");
    if (!stateParam) {
      return c.text("Missing state", 400);
    }
    const oauthReqInfo = JSON.parse(atob(stateParam)) as AuthRequest;
    if (!oauthReqInfo.clientId) {
      return c.text("Invalid state", 400);
    }

    const base_url: string = c.env.ASGARDEO_BASE_URL;
    if (!base_url) {
      return c.text("Missing ASGARDEO_BASE_URL", 400);
    }
    const token_ep: string = base_url.endsWith("/")
      ? `${base_url}oauth2/token`
      : `${base_url}/oauth2/token`;

    const cookieName = "asgardeo_req_default";
    const cookieValue = getCookie(c, cookieName);
    if (!cookieValue) {
      return c.text("Invalid or expired transaction", 400);
    }
    const authData = JSON.parse(atob(cookieValue)) as AuthData;

    // Clear the transaction cookie
    setCookie(c, cookieName, "", {
      path: "/",
      maxAge: 0,
    });

    // Exchange the code for an access token
    const [tokenSet, errResponse] = await oauth.fetchAuthToken({
      token_ep: token_ep,
      client_id: c.env.ASGARDEO_CLIENT_ID,
      client_secret: c.env.ASGARDEO_CLIENT_SECRET,
      code: c.req.query("code"),
      grant_type: "authorization_code",
      redirect_uri: new URL("/callback", c.req.url).href,
      code_verifier: authData.codeVerifier,
    });
    if (errResponse) return errResponse;

    const idToken = tokenSet.id_token as string;
    const jwksUrl: string = base_url.endsWith("/")
      ? `${base_url}oauth2/jwks`
      : `${base_url}/oauth2/jwks`;

    let issuer: string = c.env.ISSUER;
    let audience: string = c.env.AUDIENCE;
    if (!issuer) {
      issuer = token_ep;
    }
    if (!audience) {
      audience = c.env.ASGARDEO_CLIENT_ID;
    }
    const claims = await oauth.verifyIdToken(idToken, jwksUrl, issuer, audience);
    if (claims instanceof Response) {
      return claims;
    }

    // Return back to the MCP client a new token
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: claims.sub ?? "",
      metadata: {
        label: claims.username,
      },
      scope: oauthReqInfo.scope,
      // This will be available on this.props inside MyMCP
      props: {
        claimSet: claims,
        tokenSet,
        asgardeoConfig: {
          client_id: c.env.ASGARDEO_CLIENT_ID,
          client_secret: c.env.ASGARDEO_CLIENT_SECRET,
          base_url: base_url,
        },
      } as Props,
    });

    return Response.redirect(redirectTo);
  }
);

export async function tokenExchangeCallback(
  options: TokenExchangeCallbackOptions
): Promise<TokenExchangeCallbackResult | void> {
  if (options.grantType === "authorization_code") {
    return {
      newProps: {
        ...options.props,
      },
      accessTokenTTL: options.props.tokenSet.accessTokenTTL,
    };
  }

  if (options.grantType === "refresh_token") {
    const { refresh_token: asgardeoRefreshToken } = options.props.tokenSet;
    const { base_url, client_id, client_secret } = options.props.asgardeoConfig;
    const token_ep: string = base_url.endsWith("/")
      ? `${base_url}oauth2/token`
      : `${base_url}/oauth2/token`;

    // Exchange the code for an access token
    const [tokenSet, errResponse] = await oauth.fetchAuthTokenFromRefreshToken({
      token_ep: token_ep,
      client_id: client_id,
      client_secret: client_secret,
      refresh_token: asgardeoRefreshToken,
      grant_type: options.grantType,
    });

    if (errResponse || !tokenSet) {
      throw new Error(
        "Failed to refresh token: " +
        (await errResponse.text?.() || "Unknown error")
      );
    }

    const idToken = tokenSet.id_token as string;
    const jwksUrl: string = base_url.endsWith("/")
      ? `${base_url}oauth2/jwks`
      : `${base_url}/oauth2/jwks`;
    const claims = await oauth.verifyIdToken(
      idToken,
      jwksUrl,
      token_ep,
      client_id
    );
    if (claims instanceof Response) {
      throw new Error(
        "Failed to verify ID token during refresh: " +
        (await claims.text?.() || "Unknown error")
      );
    }

    return {
      newProps: {
        ...options.props,
        claims: claims,
        tokenSet: tokenSet,
      },
      accessTokenTTL: tokenSet.expires_in,
    };
  }
}

export { app as AsgardeoHandler };
