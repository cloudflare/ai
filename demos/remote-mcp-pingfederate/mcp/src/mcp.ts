import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { exchangeForTodoApiToken } from './auth';
import { TodoApiClient } from './todoApi.client';
import { type Props, type Env, API_ALLOWABLE_SCOPES } from './config';

interface McpToolContent {
  type: 'text';
  text: string;
};

/**
 * Implements the MCP server using the Cloudflare Workers McpAgent base class.
 *
 * This agent manages per-session context (with durable objects) and provide MCP clients
 * with controlled, authenticated access to MCP tools. It must perform Token Exchange
 * (delegation) to obtain a token properly audienced for any downstream APIs.
 */
export class TodoMcpServer extends McpAgent<Env, unknown, Props> {
  async init() {};

  private todoApiClient: TodoApiClient = new TodoApiClient(this.env.API_URL);

  get server() {
    const srv = new McpServer({
      name: 'MCP Server secured with PingFederate',
      version: '0.0.1',
    });

    srv.registerTool(
      'who_am_I',
      {
        description: 'Get the subject token, helpful for debugging.',
      },
      async () => {
        if (!this.props) {
          const mcpResponse: McpToolContent = { type: 'text', text: 'Error: User session not found.' };
          return { content: [mcpResponse], isError: true };
        };
        const mcpResponse: McpToolContent = { type: 'text', text: this.props.subjectToken };
        return { content: [mcpResponse] };
      },
    );

    srv.registerTool(
      'peek_api_token',
      {
        description: 'Get the token the MCP server will use on the downstream API on behalf of the current session, helpful for debugging.',
      },
      async () => {
        if (!this.props) {
          const mcpResponse: McpToolContent = { type: 'text', text: 'Error: User session not found.' };
          return { content: [mcpResponse], isError: true };
        };
        try {
          const subjectScopes = this.props.subjectClaims.scope as Array<string>;
          const apiScopes = subjectScopes.filter(scope => API_ALLOWABLE_SCOPES.includes(scope));
          const apiToken = await exchangeForTodoApiToken(this.env, this.props.subjectToken, apiScopes);
          const mcpResponse: McpToolContent = { type: 'text', text: apiToken };
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Token Exchange/Introspection Failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );

    srv.registerTool(
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
          const subjectScopes = this.props.subjectClaims.scope as Array<string>;
          const apiScopes = subjectScopes.filter(scope => API_ALLOWABLE_SCOPES.includes(scope));
          const apiToken = await exchangeForTodoApiToken(this.env, this.props.subjectToken, apiScopes);
          const data = await this.todoApiClient.getTodos(apiToken);
          const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(data, null, 2)};
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Get Todos failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );

    srv.registerTool(
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
          const subjectScopes = this.props.subjectClaims.scope as Array<string>;
          const apiScopes = subjectScopes.filter(scope => API_ALLOWABLE_SCOPES.includes(scope));
          const apiToken = await exchangeForTodoApiToken(this.env, this.props.subjectToken, apiScopes);
          const data = await this.todoApiClient.addTodo(apiToken, inputs.text);
          const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(data, null, 2)};
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Create Todo failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );

    srv.registerTool(
      'toggle_todo_status',
      {
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
          const subjectScopes = this.props.subjectClaims.scope as Array<string>;
          const apiScopes = subjectScopes.filter(scope => API_ALLOWABLE_SCOPES.includes(scope));
          const apiToken = await exchangeForTodoApiToken(this.env, this.props.subjectToken, apiScopes);
          const data = await this.todoApiClient.toggleTodo(apiToken, inputs.todoId, inputs.completed);
          const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(data, null, 2)};
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Toggle Todo failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );

    srv.registerTool(
      'delete_todo',
      {
        description: 'Deletes an existing Todo, using its ID',
        inputSchema: {
          todoId: z.string().describe('The ID of the Todo to delete'),
        },
      },
      async (inputs) => {
        if (!this.props) {
          const mcpResponse: McpToolContent = { type: 'text', text: 'Error: User session not found.' };
          return { content: [mcpResponse], isError: true };
        };
        try {
          const subjectScopes = this.props.subjectClaims.scope as Array<string>;
          const apiScopes = subjectScopes.filter(scope => API_ALLOWABLE_SCOPES.includes(scope));
          const apiToken = await exchangeForTodoApiToken(this.env, this.props.subjectToken, apiScopes);
          const data = await this.todoApiClient.deleteTodo(apiToken, inputs.todoId);
          const mcpResponse: McpToolContent = { type: 'text', text: JSON.stringify(data, null, 2)};
          return { content: [mcpResponse] };
        } catch (error: any) {
          const errorMessage = `Delete Todo failed: ${error.message || 'Unknown error'}`;
          const mcpResponse: McpToolContent = { type: 'text', text: errorMessage };
          return { content: [mcpResponse], isError: true };
        };
      },
    );

    return srv;
  };
};
