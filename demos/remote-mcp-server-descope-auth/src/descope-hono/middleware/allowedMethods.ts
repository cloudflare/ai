import { MiddlewareHandler } from "hono";
import { MethodNotAllowedError } from "../errors";

/**
 * Middleware to handle unsupported HTTP methods with a 405 Method Not Allowed response.
 *
 * @param allowedMethods - Array of allowed HTTP methods for this endpoint (e.g., ['GET', 'POST'])
 * @returns Hono middleware that returns a 405 error if method not in allowed list
 * @throws {MethodNotAllowedError} When an unsupported HTTP method is used
 */
export function allowedMethods(allowedMethods: string[]): MiddlewareHandler {
  return async (c, next) => {
    if (allowedMethods.includes(c.req.method)) {
      await next();
      return;
    }

    const error = new MethodNotAllowedError(
      `Method "${c.req.method}" is not allowed`,
    );
    
    c.header("Allow", allowedMethods.join(", "));
    return c.json(error.toResponseObject(), 405);
  };
}
