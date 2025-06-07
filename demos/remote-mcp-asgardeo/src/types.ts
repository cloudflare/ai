export type Env = {
  ASGARDEO_BASE_URL: string;
  ASGARDEO_CLIENT_ID: string;
  ASGARDEO_CLIENT_SECRET: string;
  ISSUER: string;
  ASGARDEO_SCOPE: string;
  AUDIENCE: string;
  COOKIE_ENCRYPTION_KEY: string;
};

export type TokenSet = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  received_at?: number;
};

export type AuthData = {
  codeVerifier: string;
  codeChallenge: string;
};

export type AsgardeoConfig = {
  client_id: string;
  client_secret: string;
  base_url: string;
};

// Context from the auth process, encrypted & stored in the auth token
// and provided to the DurableMCP as this.props
export type Props = {
  claimSet: Record<string, any>;
  tokenSet: TokenSet;
  asgardeoConfig?: AsgardeoConfig;
};
