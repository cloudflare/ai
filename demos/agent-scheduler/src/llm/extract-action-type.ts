import { generateObject, type LanguageModel } from "ai";
import z from "zod";
import type { Schedule } from "agents";

export async function extractActionType(
	model: LanguageModel,
	query: string,
	schedules: Schedule[]
) {
	const { object } = await generateObject({
		model,
		schema: z.object({
			action: z.string(),
			message: z.string().optional(),
		}),
		prompt: `
			You are an intelligent scheduled alarms manager. Based on the user's prompt, decide whether to:
			  - "add" a new scheduled alarm,
			  - "cancel" an existing scheduled alarm,
			  - "list" existing scheduled alarms,
			  - "none" if no action is needed.

			Prompt: "${query}"

			Current scheduled alarms: ${JSON.stringify(schedules)}

			Respond with a JSON object structured as follows:

			- To add a scheduled alarm:
			  { "action": "add" }

			- To cancel a scheduled alarm:
			  { "action": "cancel" }

			- To list scheduled alarms:
			  { "action": "list" }

			- To do nothing:
			  { "action": "none", "message": "[explanation]" }
      `,
	});

	return object;
}
