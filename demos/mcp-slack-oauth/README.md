# Remote Slack MCP Server with OAuth

This is an implementation of a remote Slack [MCP server](https://modelcontextprotocol.io/introduction) that requires users to login to their Slack account in order to use the tools to read and post messages from their channels.

You can deploy it to your own Cloudflare account, once you create a [Slack OAuth](https://api.slack.com/authentication/oauth-v2) app.

You can use this as a reference example for how to integrate other OAuth providers with an MCP server deployed to Cloudflare, using the workers-oauth-provider library.

The MCP server (powered by Cloudflare Workers):

Acts as OAuth Server to your MCP clients
Acts as OAuth Client to your real OAuth server (in this case, Slack)

> [!WARNING]
> This is a demo template designed to help you get started quickly. While we have implemented several security controls, **you must implement all preventive and defense-in-depth security measures before deploying to production**. Please review our comprehensive security guide: [Securing MCP Servers](https://github.com/cloudflare/agents/blob/main/docs/securing-mcp-servers.md)

## Available Tools

- `whoami`: Get information about your Slack user
- `listChannels`: Get a list of channels from your Slack workspace
- `getChannelMessages`: Get recent messages from a specific channel
- `postMessage`: Attempt to post a message (will fail with read-only permissions)

## Setup

### Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" and give your app a name
3. Select the workspace where you want to install the app

### Configure OAuth Settings

1. In the left sidebar, click on "OAuth & Permissions"
2. Add the following scopes under "Bot Token Scopes":
    - `channels:history`
    - `channels:read`
    - `users:read`
3. Add your redirect URL: `https://mcp-slack-oauth.<your-subdomain>.workers.dev/callback`
4. Make note of your Client ID and Client Secret from the "Basic Information" page
5. _Optional_ enable "Token Rotation" to use short-lived access tokens, which are automatically refreshed when the MCP client refreshes _its_ tokens (see `refreshSlackToken` for more details)

### Deploy to Cloudflare Workers

1. Add your Slack credentials (Slack Client ID and Client Secret) and cookie encryption key using Wrangler:

    ```bash
    wrangler secret put SLACK_CLIENT_ID
    wrangler secret put SLACK_CLIENT_SECRET
    wrangler secret put COOKIE_ENCRYPTION_KEY # add any random string here e.g. openssl rand -hex 32
    ```

2. Create a KV namespace for OAuth state storage:

    ```bash
    npx wrangler kv namespace create OAUTH_KV
    ```

    Update the KV namespace in the `wrangler.jsonc` file with the ID you receive.

    ```json
    "kv_namespaces": [
      {
        "binding": "OAUTH_KV",
        "id": "your-kv-namespace-id"
      }
    ]
    ```

3. Deploy the Worker:
    ```bash
    npm run deploy
    ```

## Usage

To use this service, connect to the MCP endpoint in your MCP client:

```
https://mcp-slack-oauth.<your-subdomain>.workers.dev/mcp
```

You'll be prompted to authorize with Slack, and then you can use the available tools to access your Slack data.

## Testing

#### Using Inspector

Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```
npx @modelcontextprotocol/inspector@latest
```

Enter `https://mcp-slack-oauth.<your-subdomain>.workers.dev/mcp` and hit connect. Once you go through the authentication flow, you'll see the Tools working.

#### Access the remote MCP server from Claude Desktop

Open Claude Desktop and navigate to Settings -> Developer -> Edit Config. This opens the configuration file that controls which MCP servers Claude can access.

Replace the content with the following configuration. Once you restart Claude Desktop, a browser window will open showing your OAuth login page. Complete the authentication flow to grant Claude access to your MCP server. After you grant access, the tools will become available for you to use.

```
{
  "mcpServers": {
    "slack-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp-slack-oauth.<your-subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

## Development

1. Install dependencies:

    ```bash
    npm install
    ```

2. Start the development server:
    ```bash
    npm run dev
    ```

## How does it work?

#### OAuth Provider

The OAuth Provider library serves as a complete OAuth 2.1 server implementation for Cloudflare Workers. It handles the complexities of the OAuth flow, including token issuance, validation, and management. In this project, it plays the dual role of:

- Authenticating MCP clients that connect to your server
- Managing the connection to Slack's OAuth services
- Securely storing tokens and authentication state in KV storage

#### createMcpHandler

`createMcpHandler` from `agents/mcp/server` serves an MCP SDK v2 `McpServer` from a Worker. It is stateless: each request builds a fresh server, so there are no sessions or Durable Objects to manage. It provides:

- Access to authenticated user information via `getMcpAuthContext()`
- Support for conditional tool availability based on user identity

#### MCP Remote

The MCP Remote library enables your server to expose tools that can be invoked by MCP clients like the Inspector. It:

- Defines the protocol for communication between clients and your server
- Provides a structured way to define tools
- Handles serialization and deserialization of requests and responses
- Serves the Streamable HTTP transport at `/mcp`
