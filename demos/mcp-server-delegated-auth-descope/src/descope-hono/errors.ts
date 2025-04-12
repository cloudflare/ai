import { OAuthErrorResponse } from "./schemas/oauth.js";

/**
 * Base class for all OAuth errors that provides standardized error handling and response formatting.
 * This class implements the OAuth 2.0 error response format as specified in RFC 6749.
 */
export class OAuthError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly errorUri?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  /**
   * Converts the error to a standard OAuth error response object that follows the OAuth 2.0 specification.
   * The response includes the error code, description, and optional URI for additional error information.
   */
  toResponseObject(): OAuthErrorResponse {
    const response: OAuthErrorResponse = {
      error: this.errorCode,
      error_description: this.message,
    };

    if (this.errorUri) {
      response.error_uri = this.errorUri;
    }

    return response;
  }
}

/**
 * Invalid request error (400) - Request is malformed or invalid.
 * Common causes:
 * - Missing required parameters
 * - Invalid parameter values
 * - Duplicate parameters
 */
export class InvalidRequestError extends OAuthError {
  constructor(message: string, errorUri?: string) {
    super("invalid_request", message, errorUri);
  }
}

/**
 * Server error (500) - Unexpected server condition preventing request fulfillment.
 * Use when no other specific error code is appropriate.
 */
export class ServerError extends OAuthError {
  constructor(message: string, errorUri?: string) {
    super("server_error", message, errorUri);
  }
}

/**
 * Invalid token error (401) - Access token is invalid or expired.
 * Common causes:
 * - Expired token
 * - Revoked token
 * - Invalid format
 * - Wrong client
 */
export class InvalidTokenError extends OAuthError {
  constructor(message: string, errorUri?: string) {
    super("invalid_token", message, errorUri);
  }
}

/**
 * Method not allowed error (405) - HTTP method not supported for endpoint.
 * Custom extension of OAuth 2.0 for clearer method validation feedback.
 */
export class MethodNotAllowedError extends OAuthError {
  constructor(message: string, errorUri?: string) {
    super("method_not_allowed", message, errorUri);
  }
}

/**
 * Invalid client metadata error (400) - Client registration metadata is invalid per RFC 7591.
 * Common causes:
 * - Missing required fields
 * - Invalid values
 * - Format errors
 * - Policy violations
 */
export class InvalidClientMetadataError extends OAuthError {
  constructor(message: string, errorUri?: string) {
    super("invalid_client_metadata", message, errorUri);
  }
}

/**
 * Insufficient scope error (403) - Token lacks required permissions.
 * Common causes:
 * - Too narrow scope
 * - Restricted permissions
 * - Privilege requirements
 */
export class InsufficientScopeError extends OAuthError {
  constructor(message: string, errorUri?: string) {
    super("insufficient_scope", message, errorUri);
  }
}
