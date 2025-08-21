import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils";
import { z } from "zod/v4";

const workersAIErrorDataSchema = z.object({
	code: z.string().nullable(),
	message: z.string(),
	object: z.literal("error"),
	param: z.string().nullable(),
	type: z.string(),
});

export const workersAIFailedResponseHandler = createJsonErrorResponseHandler({
	errorSchema: workersAIErrorDataSchema,
	errorToMessage: (data) => data.message,
});
