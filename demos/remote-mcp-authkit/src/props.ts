import type { User } from "@workos-inc/node";

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
