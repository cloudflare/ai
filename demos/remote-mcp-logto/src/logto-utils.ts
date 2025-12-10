/**
 * Logto-specific utility functions for authentication and user info retrieval.
 * This file integrates the Logto SDK with KV-based session storage.
 */

import type { PersistKey, Storage } from "@logto/node";
import LogtoClient, { type LogtoConfig } from "@logto/node";

/**
 * KV-based storage implementation for Logto authentication flow.
 *
 * Uses Cloudflare KV for persistent, distributed storage:
 * - Stores authentication session data
 * - Maintains sign-in state and tokens
 * - Handles OAuth 2.0/OIDC flow data
 * - Auto-expires sessions after 10 minutes (600 seconds)
 */
const prefix = "logto";

/**
 * Creates a session-specific storage instance for Logto authentication flow
 * @param sessionId - Unique identifier for the user session
 * @param kv - Cloudflare KV namespace for persistent storage
 * @returns Storage implementation compatible with Logto SDK
 */
function createSessionStorage(sessionId: string, kv: KVNamespace): Storage<PersistKey> {
	const sessionPrefix = `${prefix}:session:${sessionId}`;

	return {
		async getItem(key: string) {
			const value = await kv.get(`${sessionPrefix}:${key}`);
			return value ?? null;
		},

		async setItem(key: string, value: string) {
			// 10-minute TTL for Logto session data (same as OAuth state)
			await kv.put(`${sessionPrefix}:${key}`, value, { expirationTtl: 600 });
		},

		async removeItem(key: string) {
			await kv.delete(`${sessionPrefix}:${key}`);
		},
	};
}

/**
 * Props extracted from Logto user information
 */
export type LogtoUserProps = {
	userId: string;
	email: string;
	username: string;
};

/**
 * Logto client wrapper that handles the authentication flow
 */
export class LogtoHonoClient {
	private redirectResponse: Response;
	private nodeClient: LogtoClient;

	constructor(
		private logtoConfig: LogtoConfig,
		sessionId: string,
		kv: KVNamespace,
	) {
		this.redirectResponse = new Response(null, { status: 302 });

		this.nodeClient = new LogtoClient(this.logtoConfig, {
			navigate: (url) => {
				this.redirectResponse.headers.set("location", url);
			},
			storage: createSessionStorage(sessionId, kv),
		});
	}

	async handleSignIn(callbackUrl: string) {
		await this.nodeClient.signIn(callbackUrl);
		return this.redirectResponse;
	}

	async handleSignInCallback(redirectUrl: string) {
		await this.nodeClient.handleSignInCallback(redirectUrl);
	}

	async getIdTokenClaims() {
		return this.nodeClient.getIdTokenClaims();
	}
}
