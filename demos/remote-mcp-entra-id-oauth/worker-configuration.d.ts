interface Env {
  OAUTH_KV: KVNamespace;
  ENTRA_CLIENT_ID: string;
  ENTRA_CLIENT_SECRET: string;
  ENTRA_TENANT_ID: string;
  COOKIE_ENCRYPTION_KEY: string;
  MCP_OBJECT: DurableObjectNamespace<import("./src/index").EntraIdMCP>;
}
