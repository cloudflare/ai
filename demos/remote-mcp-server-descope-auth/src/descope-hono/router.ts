import { Hono } from "hono";
import { authorizationHandler } from "./handlers/authorize";
import { metadataHandler } from "./handlers/metadata";
import { registrationHandler } from "./handlers/register";
import { DescopeMcpProvider } from "./provider";

/**
 * Advertises standard Authorization Server metadata (RFC 8414).
 *
 * Also adds Dynamic Client Registration (RFC 7591) unless disabled.
 *
 * This router MUST be installed at the application root, like so:
 *
 *  const app = new Hono();
 *  app.route("/", descopeMcpAuthRouter(...));
 */
export function descopeMcpAuthRouter(
  provider?: DescopeMcpProvider,
): Hono {
  const authProvider = provider || new DescopeMcpProvider();

  const router = new Hono();

  // As stated in OAuth 2.1, section 1.4.1:
  //
  // "If the client omits the scope parameter when requesting
  // authorization, the authorization server MUST either process the
  // request using a pre-defined default value or fail the request
  // indicating an invalid scope.  The authorization server SHOULD
  // document its scope requirements and default value (if defined)."
  //
  // By default, Descope fails the request when the scope is undefined.
  // This is a workaround to instead use a default scope.
  router.route("/authorize", authorizationHandler(authProvider));

  router.route(
    "/.well-known/oauth-authorization-server",
    metadataHandler(authProvider),
  );

  if (!authProvider.options.dynamicClientRegistrationOptions?.isDisabled) {
    router.route("/register", registrationHandler(authProvider));
  }

  return router;
}
