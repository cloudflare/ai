import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { z } from 'zod';
import { TodoApiClient } from './todoApi.client';
import type { Env, Props } from './config';

interface McpToolContent {
  type: 'text';
  text: string;
};

/**
 * Implements the MCP server using the Cloudflare Workers McpAgent base class.
 *
 * This agent manages per-session context (with durable objects) and provide MCP clients with
 * controlled, authenticated access to MCP tools. Since our custom Ping handlers ensure the
 * token is correctly audienced for the downstream API, token exchange is not necessary.
 */
export class TodoMcpServer extends McpAgent<Env, unknown, Props> {
  server = new McpServer({
    name: 'OIDC MCP Server secured with PingOne',
    version: '0.0.1',
  });

  private todoClient!: TodoApiClient;

  async init() {
    this.todoClient = new TodoApiClient(this.env.API_URL);

    this.server.registerTool(
      'who_am_I',
      {
        description: 'Get the token for the current session info, helpful for debugging.',
      },
      async () => {
        if (!this.props) {
          const mcpResponse: McpToolContent = { type: 'text', text: 'Error: User session not found.' };
          return { content: [mcpResponse], isError: true };
        };
        const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(this.props, null, 2) };
        return { content: [mcpResponse] };
      },
    );

    this.server.registerTool(
      'get_my_todo_list',
      {
        description: 'Get the Todo list for the current session from the Todo API.',
      },
      async () => {
        if (!this.props) {
          const mcpResponse: McpToolContent = { type: 'text', text: 'Error: User session not found.' };
          return { content: [mcpResponse], isError: true };
        };
        try {
          const data = await this.todoClient.getTodos(this.props.subjectToken);
          const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(data, null, 2)};
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Get Todos failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );

    this.server.registerTool(
      'create_new_todo',
      {
        description: 'Adds a new todo to the current sessions Todo list by calling the Todo API.',
        inputSchema: {
          text: z.string().describe('Todo item text'),
        },
      },
      async (inputs) => {
        if (!this.props) {
          const mcpResponse: McpToolContent = { type: 'text', text: 'Error: User session not found.' };
          return { content: [mcpResponse], isError: true };
        };
        try {
          const data = await this.todoClient.addTodo(this.props.subjectToken, inputs.text);
          const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(data, null, 2)};
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Create Todo failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );

    this.server.registerTool(
      'toggle_todo_status',
      {
        title: 'Toggle Todo Status',
        description: 'Marks an existing Todo as either completed or incomplete, using its ID and the target status',
        inputSchema: {
          todoId: z.string().describe('The ID of the Todo to update'),
          completed: z.boolean().describe('The target status (true for complete, false for incomplete)'),
        },
      },
      async (inputs) => {
        if (!this.props) {
          const mcpResponse: McpToolContent = { type: 'text', text: 'Error: User session not found.' };
          return { content: [mcpResponse], isError: true };
        };
        try {
          const data = await this.todoClient.toggleTodo(this.props.subjectToken, inputs.todoId, inputs.completed);
          const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(data, null, 2)};
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Toggle Todo failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );

    this.server.registerTool(
      'deleteTodo',
      {
        title: 'Delete Todo',
        description: 'Deletes an existing Todo, using its ID',
        inputSchema: {
          todoId: z.string().describe('The ID of the Todo to delete')
        },
      },
      async (inputs) => {
        if (!this.props) {
          const mcpResponse: McpToolContent = { type: 'text', text: 'Error: User session not found.' };
          return { content: [mcpResponse], isError: true };
        };
        try {
          const data = await this.todoClient.deleteTodo(this.props.subjectToken, inputs.todoId);
          const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(data, null, 2)};
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Delete Todo failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );
  };
};
