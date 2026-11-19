import type { User } from "@workos-inc/node";

export interface Props {
	user: User;
	accessToken: string;
	refreshToken: string;
	permissions: string[];
	organizationId?: string;

	// OAuthProvider stores props as a plain record.
	[key: string]: unknown;
}
