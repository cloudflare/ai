import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, streamText, type UIMessage } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { models } from "../models";

type Env = {
	AI: Ai;
};

type PostInferenceBody = {
	lora: string | null;
	messages: UIMessage[];
	model: keyof AiModels;
	max_tokens: number;
	stream: boolean;
	system_message: string;
	tools: Tool[];
};

async function replyToMessage(
	request: Request,
	env: Env,
	_ctx: ExecutionContext,
) {
	const modelNames = models.map((model) => model.name);

	const {
		model,
		messages,
		system_message,
		max_tokens,
		tools = [],
		lora: _lora,
	} = await request.json<PostInferenceBody>();

	// Invalid model sent to API, return 400
	if (!modelNames.includes(model)) {
		return new Response(null, {
			status: 400,
		});
	}

	const workersai = createWorkersAI({
		binding: env.AI,
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
		maxTokens: max_tokens,
		messages,
		model: workersai(model as Parameters<typeof workersai>[0]),
		onError: (err) => {
			console.log({ err });
		},
		system: system_message,
		toolCallStreaming: false,
		tools: mcpTools,
	});

	return result.toUIMessageStreamResponse({
		onError: (error: unknown) => {
			console.log(error);
			return "Error during inference";
		},
		headers: {
			"Content-Type": "text/x-unknown",
			"content-encoding": "identity",
			"transfer-encoding": "chunked",
		},
	});
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		switch (`${request.method} ${url.pathname}`) {
			case "POST /api/inference":
				return replyToMessage(request, env, ctx);
			default:
				return new Response("Not found", { status: 404 });
		}
	},
};
