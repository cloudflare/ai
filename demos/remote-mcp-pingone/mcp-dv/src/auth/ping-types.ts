import * as oauth from "oauth4webapi";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

export interface PingOneOidcConfig {
  as: oauth.AuthorizationServer;
  client: oauth.Client;
  clientTokenCredential: ReturnType<typeof oauth.ClientSecretBasic>;
};

export interface PingOneTokenSet {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  id_token: string;
};

export interface PingOneUserClaims {
  sub: string;
  preferred_username: string;
  given_name: string;
  family_name: string;
  email: string;
};

export interface PkceAndNonce {
  code_verifier: string;
  code_challenge: string;
  nonce: string;
};

export type ExtendedAuthRequest = AuthRequest & { pkceAndNonce: PkceAndNonce };
