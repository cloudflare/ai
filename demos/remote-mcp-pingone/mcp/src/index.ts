import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { OAuthProvider, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { z } from 'zod';
import { handleAuthorize, handlePingOneCallback, handleConsentApproval } from './auth/ping-handler';
import { TodoApiClient } from './todoApi.client';
import type { Env, Props } from './config';

/**
 * The stateful Cloudflare agent implementing the MCP Server.
 *
 * Extends McpAgent to leverage Cloudflare Durable Objects for stateful execution
 * and initializes McpServer to define the tools accessible by MCP clients.
 *
 * This MCP server is exposed via the Cloudflare OAuth Provider which handles the
 * OAuth 2.1 flow. Upon successful MCP client authorization, the agent is
 * instantiated with the authenticated user's session (this.props).
 */
export class TodoMCPServer extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: 'OIDC MCP Server secured with PingOne',
		version: '1.0.0',
	});
  private todoClient!: TodoApiClient;

	async init() {
    this.todoClient = new TodoApiClient();

    this.server.registerTool(
      'whoAmI',
      {
        title: 'User Identity and Token',
        description: 'Fetch identity and access token data for the current session, helpful for debugging',
      },
      async () => {
        if (!this.props) {
          return {
            content: [{ type: 'text', text: 'Error: User session not found' }],
            isError: true
          };
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(this.props, null, 2) }],
          structuredContent: this.props
        };
      },
    );

    this.server.registerTool(
      'getTodos',
      {
        title: 'Get Todo List',
        description: "Fetch the current user's list of Todos",
      },
      async () => {
        if (!this.props) {
          return {
            content: [{ type: 'text', text: 'Error: User session not found' }],
            isError: true
          };
        };
        try {
          const data = await this.todoClient.getTodos(this.props.tokenSet.access_token);
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: { todos : data }
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: `Error getting Todo list: ${error.message}` }],
            isError: true
          };
        };
      },
    );

    this.server.registerTool(
      'addTodo',
      {
        title: 'Add Todo',
        description: "Add a new Todo to the current user's list of Todos",
        inputSchema: {
          text: z.string().describe('Todo item text')
        },
      },
      async (inputs) => {
        if (!this.props) {
          return {
            content: [{ type: 'text', text: 'Error: User session not found' }],
            isError: true
          };
        };
        try {
          const data = await this.todoClient.addTodo(this.props.tokenSet.access_token, inputs.text);
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: { todos: data }
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: `Error adding Todo: ${error.message}` }],
            isError: true
          };
        };
      },
    );

    this.server.registerTool(
      'toggleTodoStatus',
      {
        title: 'Toggle Todo Status',
        description: 'Marks an existing Todo as either completed or incomplete, using its ID and the target status',
        inputSchema: {
          todoId: z.string().describe('The ID of the Todo to update'),
          completed: z.boolean().describe('The target status (true for complete, false for incomplete)')
        },
      },
      async (inputs) => {
        if (!this.props) {
          return {
            content: [{ type: 'text', text: 'Error: User session not found' }],
            isError: true
          };
        };
        try {
          const data = await this.todoClient.toggleTodo(
            this.props.tokenSet.access_token,
            inputs.todoId,
            inputs.completed
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: { todos: data }
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: `Error updating Todo status: ${error.message}` }],
            isError: true
          };
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
          return {
            content: [{ type: 'text', text: 'Error: User session not found' }],
            isError: true
          };
        };
        try {
          const data = await this.todoClient.deleteTodo(this.props.tokenSet.access_token, inputs.todoId);
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: { todos: data }
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: `Error deleting Todo: ${error.message}` }],
            isError: true
          };
        };
      },
    );
  };
};

/**
 * Initialize custom PingOne OAuth handlers to work with the CF OAuth Provider:
 * 1. Handle the authorization entry point, which routes to CF consent OR straight to PingOne.
 * 2. Handle CF consent confirmation, which then delegates to PingOne for authentication.
 * 3. Handle the PingOne callback, completing the token exchange, persisting the user session
 *    in a Durable Object, and issuing an MCP client Authorization Code.
 */
const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();
app.get('/authorize', handleAuthorize);
app.post('/authorize', handleConsentApproval);
app.get('/callback', handlePingOneCallback);

/**
 * This config ensures that only MCP clients authenticated with PingOne can access services hosted at '/mcp'.
 */
export default new OAuthProvider({
	apiHandlers: {
		'/mcp': TodoMCPServer.serve('/mcp'), // Streamable-HTTP protocol
	},
  authorizeEndpoint: '/authorize',
  clientRegistrationEndpoint: '/register',
  defaultHandler: app as any,
  tokenEndpoint: '/token'
});
