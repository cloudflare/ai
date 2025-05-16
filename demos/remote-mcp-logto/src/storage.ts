import type { PersistKey, Storage } from "@logto/node";

/**
 * In-memory storage implementation for demo purposes only.
 *
 * WARNING: For production environments, you should:
 * - Use a persistent storage solution (e.g., Redis, database)
 * - Implement proper session management with TTL
 * - Consider security and scalability requirements
 *
 * This storage is used by Logto SDK to:
 * - Store authentication session data
 * - Maintain sign-in state and tokens
 * - Handle OAuth 2.0/OIDC flow data
 */

const memoryStore = new Map<string, string>();
const prefix = "logto_";

/**
 * Creates a session-specific storage instance for Logto authentication flow
 * @param sessionId - Unique identifier for the user session
 * @returns Storage implementation compatible with Logto SDK
 */
export function createSessionStorage(sessionId: string): Storage<PersistKey> {
	const sessionPrefix = `${sessionId}_${prefix}`;

	return {
		async getItem(key: string) {
			const value = memoryStore.get(`${sessionPrefix}${key}`);
			return value ?? null;
		},

		async setItem(key: string, value: string) {
			memoryStore.set(`${sessionPrefix}${key}`, value);
		},

		async removeItem(key: string) {
			memoryStore.delete(`${sessionPrefix}${key}`);
		},
	};
}
