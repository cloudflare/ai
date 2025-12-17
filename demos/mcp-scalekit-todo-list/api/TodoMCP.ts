import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'
import {todoService} from "./TodoService.ts";
import {AuthenticationContext, Todo} from "../types";
import {McpAgent} from "agents/mcp";

/**
 * The `TodoMCP` class exposes the TODO Service via the Model Context Protocol
 * for consumption by API Agents
 */
export class TodoMCP extends McpAgent<Env, unknown, AuthenticationContext> {
    async init() {
    }

    get todoService() {
        return todoService(this.env, this.props.claims.sub)
    }

    formatResponse = (description: string, newState: Todo[]): {
        content: Array<{ type: 'text', text: string }>
    } => {
        return {
            content: [{
                type: "text",
                text: `Success! ${description}\n\nNew state:\n${JSON.stringify(newState, null, 2)}}`
            }]
        };
    }

    get server() {
        const server = new McpServer({
            name: 'TODO Service',
            version: '1.0.0',
        })

        server.resource("Todos", new ResourceTemplate("todoapp://todos/{id}", {
                list: async () => {
                    const todos = await this.todoService.get()

                    return {
                        resources: todos.map(todo => ({
                            name: todo.text,
                            uri: `todoapp://todos/${todo.id}`
                        }))
                    }
                }
            }),
            async (uri, {id}) => {
                const todos = await this.todoService.get();
                const todo = todos.find(todo => todo.id === id);
                return {
                    contents: [
                        {
                            uri: uri.href,
                            text: todo ? `text: ${todo.text} completed: ${todo.completed}` : 'NOT FOUND',
                        },
                    ],
                }
            },
        )

        server.tool('createTodo', 'Add a new TODO task', {todoText: z.string()}, async ({todoText}) => {
            const todos = await this.todoService.add(todoText)
            return this.formatResponse('TODO added successfully', todos)
        })

        server.tool('markTodoComplete', 'Mark a TODO as complete', {todoID: z.string()}, async ({todoID}) => {
            const todos = await this.todoService.markCompleted(todoID)
            return this.formatResponse('TODO completed successfully', todos)
        })

        server.tool('deleteTodo', 'Mark a TODO as deleted', {todoID: z.string()}, async ({todoID}) => {
            const todos = await this.todoService.delete(todoID)
            return this.formatResponse('TODO deleted successfully', todos)
        })

        return server
    }
}