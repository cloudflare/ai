import { Hono } from "hono";
import { allowedMethods } from "../middleware/allowedMethods.js";
import { DescopeMcpProvider } from "../provider.js";

export function authorizationHandler(
  provider: DescopeMcpProvider,
): Hono {
  const app = new Hono();
  
  app.use("*", allowedMethods(["GET", "POST"]));

  app.all("/", async (c) => {
    // Get parameters from either POST body or query string
    const params = c.req.method === "POST" 
      ? await c.req.parseBody() 
      : c.req.query();

    // If no scope is provided, add the default openid scope
    // Otherwise, the authorization server will throw an error
    if (!params.scope) {
      params.scope = "openid";
    }

    // Redirect to the Descope authorization URL with all parameters
    const targetUrl = provider.descopeOAuthEndpoints.authorization;
    targetUrl.search = new URLSearchParams(params as Record<string, string>).toString();
    
    return c.redirect(targetUrl.toString());
  });

  return app;
}
