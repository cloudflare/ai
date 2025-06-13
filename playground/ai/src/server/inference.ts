import fetchModels from "./fetchModels";
import { createWorkersAI } from "workers-ai-provider";
import { jsonSchema, streamText, type UIMessage } from "ai";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Model } from "./fetchModels";

type PostInferenceBody = {
	lora: string | null;
	messages: UIMessage[];
	model: keyof AiModels;
	max_tokens: number;
	stream: boolean;
	system_message: string;
	tools: Tool[];
};

export async function replyToMessage(
	request: Request,
	env: Env,
	_ctx: ExecutionContext,
) {
	const response = await fetchModels().then((res) =>
		res.json<{ models: Model[] }>(),
	);
	const models = response.models.map((model) => model.name);

	const {
		model,
		messages,
		system_message,
		max_tokens,
		tools = [],
		lora,
	} = await request.json<PostInferenceBody>();

	// Invalid model sent to API, return 400
	if (!models.includes(model)) {
		return new Response(null, {
			status: 400,
		});
	}

	const workersai = createWorkersAI({
		binding: env.AI,
		// apiKey: env.CLOUDFLARE_API_TOKEN,
		// accountId: env.CLOUDFLARE_ACCOUNT_ID,
	});
	const mcpTools = Object.fromEntries(
		tools.map((t) => {
			return [
				t.name,
				{
					description: t.description,
					// @ts-expect-error it's fine
					parameters: jsonSchema(t.inputSchema),
				},
			];
		}),
	);
	// console.log(tools);
	// console.log(mcpTools);

	const result = streamText({
		model: workersai(model as Parameters<typeof workersai>[0]),
		messages,
		system: system_message,
		maxTokens: max_tokens,
		toolCallStreaming: false,
		tools: mcpTools,
		onError: (err) => {
			console.log({ err });
		},
	});

	return result.toDataStreamResponse({
		headers: {
			"Content-Type": "text/x-unknown",
			"content-encoding": "identity",
			"transfer-encoding": "chunked",
		},
		getErrorMessage: (error: unknown) => {
			console.log(error);
			return "Error during inference";
		},
	});
}
