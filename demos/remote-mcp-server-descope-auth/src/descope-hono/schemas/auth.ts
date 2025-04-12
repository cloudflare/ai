import { z } from "zod";

/**
 * Information about a validated access token, provided to request handlers.
 */
export const AuthInfoSchema = z.object({
  /** The access token */
  token: z.string(),

  /** The client ID associated with this token */
  clientId: z.string(),

  /** Scopes associated with this token */
  scopes: z.array(z.string()),

  /** When the token expires (in seconds since epoch) */
  expiresAt: z.number().optional(),
});

export type AuthInfo = z.infer<typeof AuthInfoSchema>;
