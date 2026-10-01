interface Env {
	DESCOPE_CLIENT_ID: string;
	DESCOPE_CLIENT_SECRET: string;
	DESCOPE_PROJECT_ID: string;
	DESCOPE_MCP_SERVER_ID: string;
	DESCOPE_BASE_URL?: string;
	DESCOPE_SCOPES?: string;
	DESCOPE_ENABLE_PKCE?: string;
	DESCOPE_RESOURCE?: string;
	COOKIE_ENCRYPTION_KEY: string;
}


declare namespace Cloudflare {
	interface Env {
		DESCOPE_CLIENT_ID: string;
		DESCOPE_CLIENT_SECRET: string;
		DESCOPE_PROJECT_ID: string;
		DESCOPE_MCP_SERVER_ID: string;
		DESCOPE_BASE_URL?: string;
		DESCOPE_SCOPES?: string;
		DESCOPE_ENABLE_PKCE?: string;
		DESCOPE_RESOURCE?: string;
		COOKIE_ENCRYPTION_KEY: string;
	}
}
