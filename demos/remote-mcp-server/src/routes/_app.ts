import { Hono } from "hono";
import { OAuthHelpers } from "workers-mcp/vendor/workers-oauth-provider/oauth-provider.js";

export type Bindings = Env & {
	OAUTH_PROVIDER: OAuthHelpers;
};

type Variables = {
	isLoggedIn: boolean;
};
const app = new Hono<{
	Bindings: Bindings;
	Variables: Variables;
}>();
export default app;
