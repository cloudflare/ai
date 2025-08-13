# Model Context Protocol (MCP) Server + Atlassian OAuth

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server that supports remote MCP connections, with Atlassian OAuth built-in.

You can deploy it to your own Cloudflare account, and after you create your own Atlassian OAuth client app, you'll have a fully functional remote MCP server that you can build off. Users will be able to connect to your MCP server by signing in with their Atlassian account.

You can use this as a reference example for how to integrate other OAuth providers with an MCP server deployed to Cloudflare, using the [`workers-oauth-provider` library](https://github.com/cloudflare/workers-oauth-provider).

The MCP server (powered by [Cloudflare Workers](https://developers.cloudflare.com/workers/)): 

* Acts as OAuth _Server_ to your MCP clients
* Acts as OAuth _Client_ to your _real_ OAuth server (in this case, Atlassian)
* Provides tools to get the user information from Confluence.

## Getting Started

Clone the repo directly & install dependencies: `npm install`.

### For Production
Create a new [Atlassian OAuth App](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/): 
- Go to https://developer.atlassian.com/console/myapps/
- Create a new app and select "OAuth 2.0 (3LO)"
- For the Callback URL, specify `https://mcp-server-atlassian.<your-subdomain>.workers.dev/callback`
- Add the needed scope:
  - `read:confluence-user`
- Note your Client ID and generate a Client secret
- Set secrets via Wrangler
```bash
wrangler secret put CLIENT_ID # Your Atlassian Client ID
wrangler secret put CLIENT_SECRET # Your Atlassian Client Secret
wrangler secret put COOKIE_ENCRYPTION_KEY # add any random string here e.g. openssl rand -hex 32
```

> [!IMPORTANT]
> When you create the first secret, Wrangler will ask if you want to create a new Worker. Submit "Y" to create a new Worker and save the secret.

#### Set up a KV namespace
- Create the KV namespace: 
`wrangler kv namespace create "OAUTH_KV"`
- Update the Wrangler [file](wrangler.jsonc) with the KV ID

#### Deploy & Test
Deploy the MCP server to make it available on your workers.dev domain 
` wrangler deploy`

Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector): 

```
npx @modelcontextprotocol/inspector@latest
```
Enter `https://mcp-server-atlassian.<your-subdomain>.workers.dev/sse` and hit connect. Once you go through the authentication flow, you'll see the Confluence tools working.

You now have a remote MCP server deployed! 

### Available Tools

This MCP server uses Atlassian OAuth for authentication. All authenticated Atlassian users can access the following tools:

- **add**: A simple demonstration tool that adds two numbers
- **getUserInfo**: Get current user information from Confluence

### Access the remote MCP server from Claude Desktop

Open Claude Desktop and navigate to Settings -> Developer -> Edit Config. This opens the configuration file that controls which MCP servers Claude can access.

Replace the content with the following configuration. Once you restart Claude Desktop, a browser window will open showing your OAuth login page. Complete the authentication flow to grant Claude access to your MCP server. After you grant access, the tools will become available for you to use. 

```
{
  "mcpServers": {
    "confluence": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp-atlassian-oauth.<your-subdomain>.workers.dev/sse"
      ]
    }
  }
}
```

Once the Tools (under 🔨) show up in the interface, you can ask Claude to use them. For example: 
- "Could you use the math tool to add 23 and 19?"

### For Local Development
If you'd like to iterate and test your MCP server, you can do so in local development. This will require you to create another OAuth App on Atlassian: 
- Follow the same steps as production but use `http://localhost:8788/callback` as the callback URL
- Note your Client ID and generate a Client secret
- Create a `.dev.vars` file in your project root with: 
```
CLIENT_ID=your_development_atlassian_client_id
CLIENT_SECRET=your_development_atlassian_client_secret
COOKIE_ENCRYPTION_KEY=your_random_encryption_key
```

#### Develop & Test
Run the server locally to make it available at `http://localhost:8788`
```bash
wrangler dev
```

To test the local server, enter `http://localhost:8788/sse` into Inspector and hit connect. Once you follow the prompts, you'll be able to "List Tools". 

#### Using Claude and other MCP Clients

When using Claude to connect to your remote MCP server, you may see some error messages. This is because Claude Desktop doesn't yet support remote MCP servers, so it sometimes gets confused. To verify whether the MCP server is connected, hover over the 🔨 icon in the bottom right corner of Claude's interface. You should see your tools available there.

#### Using Cursor and other MCP Clients

To connect Cursor with your MCP server, choose `Type`: "Command" and in the `Command` field, combine the command and args fields into one (e.g. `npx mcp-remote https://<your-worker-name>.<your-subdomain>.workers.dev/sse`).

Note that while Cursor supports HTTP+SSE servers, it doesn't support authentication, so you still need to use `mcp-remote` (and to use a STDIO server, not an HTTP one).

You can connect your MCP server to other MCP clients like Windsurf by opening the client's configuration file, adding the same JSON that was used for the Claude setup, and restarting the MCP client.

## How does it work? 

#### OAuth Provider
The OAuth Provider library serves as a complete OAuth 2.1 server implementation for Cloudflare Workers. It handles the complexities of the OAuth flow, including token issuance, validation, and management. In this project, it plays the dual role of:

- Authenticating MCP clients that connect to your server
- Managing the connection to Atlassian's OAuth services
- Securely storing tokens and authentication state in KV storage

#### Durable MCP
Durable MCP extends the base MCP functionality with Cloudflare's Durable Objects, providing:
- Persistent state management for your MCP server
- Secure storage of authentication context between requests
- Access to authenticated user information via `this.props`
- Support for conditional tool availability based on user identity

#### MCP Remote
The MCP Remote library enables your server to expose tools that can be invoked by MCP clients like the Inspector. It:
- Defines the protocol for communication between clients and your server
- Provides a structured way to define tools
- Handles serialization and deserialization of requests and responses
- Maintains the Server-Sent Events (SSE) connection between clients and your server
