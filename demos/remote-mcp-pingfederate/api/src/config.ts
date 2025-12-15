/**
 * External resources (bindings) available to the worker at runtime.
 */
export type Env = {
  TODO_KV_PING_FEDERATE: KVNamespace;
  API_ISSUER: string;
  API_AUDIENCE: string;
};

/**
 * Request-scoped data set by middleware after authentication,
 * available in the hono request context.
 */
export type APIVariables = {
  USER_ID: string;
  USER_SCOPES: string[];
};

export const TODO_READ_SCOPE = 'todo_api:read';
export const TODO_WRITE_SCOPE = 'todo_api:write';
