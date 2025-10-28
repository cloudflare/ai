import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Organization, User } from "@workos-inc/node";

export type AuthInteractionSession = {
	upstreamState: string; // For upstream provider state validation
	codeVerifier: string; // For upstream PKCE
	codeChallenge: string; // For upstream PKCE
	mcpAuthRequestInfo: AuthRequest;
};

export interface Props {
	user: User;
	accessToken: string;
	refreshToken: string;
	permissions: string[];
	organizationId?: string;

	// Props must have an index signature to satsify the `McpAgent`
	// generic `Props` which extends `Record<string, unknown>`.
	[key: string]: unknown;
}
