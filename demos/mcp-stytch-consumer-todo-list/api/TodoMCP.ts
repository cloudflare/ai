import { env } from "cloudflare:workers";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import type { AuthenticationContext, Todo } from "../types";
import { todoService } from "./TodoService.ts";

const formatResponse = (
	description: string,
	newState: Todo[],
): {
	content: Array<{ type: "text"; text: string }>;
} => {
	return {
		content: [
			{
				text: `Success! ${description}\n\nNew state:\n${JSON.stringify(newState, null, 2)}}`,
				type: "text",
			},
		],
	};
};

/**
 * `createTodoServer` exposes the TODO Service via the Model Context Protocol
 * for consumption by API Agents. It runs once per request, after
 * `stytchBearerTokenAuthMiddleware` has verified the caller.
 */
export function createTodoServer() {
	const props = getMcpAuthContext()?.props as AuthenticationContext;
	const todos = todoService(env, props.claims.sub);

	const server = new McpServer({
		name: "TODO Service",
		version: "1.0.0",
	});

	server.registerResource(
		"Todos",
		new ResourceTemplate("todoapp://todos/{id}", {
			list: async () => {
				const all = await todos.get();

				return {
					resources: all.map((todo) => ({
						name: todo.text,
						uri: `todoapp://todos/${todo.id}`,
					})),
				};
			},
		}),
		{},
		async (uri, { id }) => {
			const all = await todos.get();
			const todo = all.find((todo) => todo.id === id);
			return {
				contents: [
					{
						text: todo
							? `text: ${todo.text} completed: ${todo.completed}`
							: "NOT FOUND",
						uri: uri.href,
					},
				],
			};
		},
	);

	server.registerTool(
		"createTodo",
		{ description: "Add a new TODO task", inputSchema: z.object({ todoText: z.string() }) },
		async ({ todoText }) => {
			const result = await todos.add(todoText);
			return formatResponse("TODO added successfully", result);
		},
	);

	server.registerTool(
		"markTodoComplete",
		{ description: "Mark a TODO as complete", inputSchema: z.object({ todoID: z.string() }) },
		async ({ todoID }) => {
			const result = await todos.markCompleted(todoID);
			return formatResponse("TODO completed successfully", result);
		},
	);

	server.registerTool(
		"deleteTodo",
		{ description: "Mark a TODO as deleted", inputSchema: z.object({ todoID: z.string() }) },
		async ({ todoID }) => {
			const result = await todos.delete(todoID);
			return formatResponse("TODO deleted successfully", result);
		},
	);

	return server;
}
