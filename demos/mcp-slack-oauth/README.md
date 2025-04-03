# Remote Slack MCP Server with OAuth

This is an implementation of a remote Slack [MCP server](https://modelcontextprotocol.io/introduction) that requires users to login to their Slack account in order to use the tools to read and post messages from their channels. 

You can deploy it to your own Cloudflare account, once you create a [Slack OAuth](https://api.slack.com/authentication/oauth-v2) app.

You can use this as a reference example for how to integrate other OAuth providers with an MCP server deployed to Cloudflare, using the workers-oauth-provider library.

The MCP server (powered by Cloudflare Workers):

Acts as OAuth Server to your MCP clients
Acts as OAuth Client to your real OAuth server (in this case, Slack)

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
5. *Optional* enable "Token Rotation" to use short-lived access tokens, which are automatically refreshed when the MCP client refreshes _its_ tokens (see `refreshSlackToken` for more details)

### Deploy to Cloudflare Workers

1. Add you Slack credentials (Slack Client ID and Client Secret) using Wrangler:
   ```bash
   wrangler secret put SLACK_CLIENT_ID
   wrangler secret put SLACK_CLIENT_SECRET
   ```

2. Create a KV namespace for OAuth token storage:
   ```bash
   wrangler kv:namespace create OAUTH_KV
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

To use this service, connect to the SSE endpoint in your MCP client:

```
https://mcp-slack-oauth.<your-subdomain>.workers.dev/sse
```

You'll be prompted to authorize with Slack, and then you can use the available tools to access your Slack data.

## Testing

#### Using Inspector
Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector): 

```
npx @modelcontextprotocol/inspector@latest
```
Enter `https://mcp-slack-oauth.<your-subdomain>.workers.dev/sse` and hit connect. Once you go through the authentication flow, you'll see the Tools working. 

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
        "https://mcp-slack-oauth.<your-subdomain>.workers.dev/sse"
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

#### McpAgent
McpAgent extends the base MCP functionality with Cloudflare's Agents SDK, providing:
- Persistent state management for your MCP server
- Secure storage of authentication context between requests
- Access to authenticated user information via this.props
- Support for conditional tool availability based on user identity
- Integration with Cloudflare's Agent platform for extended AI capabilities

#### MCP Remote
The MCP Remote library enables your server to expose tools that can be invoked by MCP clients like the Inspector. It:
- Defines the protocol for communication between clients and your server
- Provides a structured way to define tools
- Handles serialization and deserialization of requests and responses
- Maintains the Server-Sent Events (SSE) connection between clients and your server
