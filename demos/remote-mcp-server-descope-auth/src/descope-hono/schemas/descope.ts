import { z } from "zod";

/**
 * Descope error response schema
 */
export const DescopeErrorResponseSchema = z.object({
  errorCode: z.string().optional(),
  errorDescription: z.string().optional(),
});

export type DescopeErrorResponse = z.infer<typeof DescopeErrorResponseSchema>;
