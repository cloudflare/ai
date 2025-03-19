# Remote MCP Server on Cloudflare

Let's get a remote MCP server up-and-running on Cloudflare Workers complete with OAuth login!

## Develop locally

```bash
# clone the repository
git clone git@github.com:cloudflare/ai.git

# navigate to this example
cd ai/demos/remote-mcp-server

# install dependencies
npm install

# run locally
npm run dev
```

You should be able to open [`http://localhost:8787/`](http://localhost:8787/) in your browser

## Connect the MCP inspector to your server

To explore your new MCP api, you can use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).

- Start it with `npx @modelcontextprotocol/inspector`
- [Within the inspector](http://localhost:5173), switch the Transport Type to `SSE` and enter `http://localhost:8787/sse` as the URL of the MCP server to connect to, and click "Connect"
- You will navigate to a (mock) user/password login screen. Input any email and pass to login.
- You should be redirected back to the MCP Inspector and you can now list and call any defined tools!

![MCP Inspector with the above config](img/mcp-inspector-sse-config.png)

![MCP Inspector with after a tool call](img/mcp-inspector-successful-tool-call.png)

## Connect Claude Desktop to your local server

The MCP inspector is great, but we really want to connect this to Claude! Follow [Anthropic's Quickstart](<https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config to find your configuration file.

Open the file in your text editor and replace it with this configuration:

```json
{
  "mcpServers": {
    "math": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"
      ]
    }
  }
}
```

This will run a local proxy and let Claude talk to your MCP server over HTTP

When you open Claude a browser window should open and allow you to login. You should see the tools available in the bottom right. Given the right prompt Claude should ask to call the tool.

![Clicking on the hammer icon shows a list of available tools](img/available-tools.png)
![Claude answers the prompt "I seem to have lost my calculator and have run out of fingers. Could you use the math tool to add 23 and 19?" by invoking the MCP add tool](img/claude-does-math-the-fancy-way.png)

## Deploy to Cloudflare

1. `npx wrangler@latest kv namespace create remote-mcp-server-oauth-kv`
2. Follow the guidance to add the kv namespace ID to `wrangler.jsonc`
3. `npm run deploy`

## Call your newly deployed remote MCP server from a remote MCP client

Just like you did above in "Develop locally", run the MCP inspector:

`npx @modelcontextprotocol/inspector@latest`

Then enter the `workers.dev` URL (ex: `worker-name.account-name.workers.dev/sse`) of your Worker in the inspector as the URL of the MCP server to connect to, and click "Connect".

You've now connected to your MCP server from a remote MCP client.

## Debugging

```bash
npx mcp-remote http://localhost:8787/sse
```