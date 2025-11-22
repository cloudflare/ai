/**
 * External resources (bindings) available to the worker at runtime.
 */
export type Env = {
  TODO_KV_NAMESPACE: KVNamespace;
  PINGONE_DOMAIN: string;
  PINGONE_AUDIENCE: string;
};

/**
 * Request-scoped data set by middleware after authentication.
 */
export type APIVariables = {
  USER_ID: string;
  USER_SCOPES: string;
};
