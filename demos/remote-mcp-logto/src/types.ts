import { AuthRequest } from "@cloudflare/workers-oauth-provider";

export type Props = {
	userId: string;
	email: string;
	username: string;
};

export type AuthInteractionSession = {
	sessionId: string;
	mcpAuthRequestInfo: AuthRequest;
};
