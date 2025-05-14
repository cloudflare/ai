import { generateObject, type LanguageModel } from "ai";
import z from "zod";
import type { Schedule } from "agents";

export async function extractScheduleId(
	model: LanguageModel,
	query: string,
	schedules: Schedule[]
) {
	const { object } = await generateObject({
		model,
		schema: z.object({
			scheduleId: z.string().optional(),
		}),
		prompt: `
			You are an intelligent schedule manager. The user requested cancelling a schedule.
			Try to figure out which schedule ID from the list below is the best match.

			Prompt: "${query}"

			Current schedules: ${JSON.stringify(schedules)}

			Respond with a JSON object of the form:

			- if you find a match:
			{ "scheduleId": "[id]" }

			- if not:
			{ "scheduleId": undefined }
        `,
	});

	return object.scheduleId;
}
