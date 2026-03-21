export type WorkersAIChatPrompt = Array<WorkersAIChatMessage>;

export type WorkersAIChatMessage =
	| WorkersAISystemMessage
	| WorkersAIUserMessage
	| WorkersAIAssistantMessage
	| WorkersAIToolMessage;

export type WorkersAIContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

export interface WorkersAISystemMessage {
	role: "system";
	content: string;
}

export interface WorkersAIUserMessage {
	role: "user";
	content: string | WorkersAIContentPart[];
}

export interface WorkersAIAssistantMessage {
	role: "assistant";
	content: string;
	reasoning?: string;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}>;
}

export interface WorkersAIToolMessage {
	role: "tool";
	name: string;
	content: string;
	tool_call_id: string;
}
