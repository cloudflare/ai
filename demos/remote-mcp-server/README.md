# Remote MCP Server on Cloudflare

## Develop locally

1. `npm install`
2. `npm start` (Your MCP server is now running on `http://localhost:8787/sse`)
3. `npx @modelcontextprotocol/inspector@latest` (start the MCP inspector)
4. Within the inspector, enter `http://localhost:8787/sse` as the URL of the MCP server to connect to, and click "Connect"

You will be prompted with a (mock) user/password login screen. Enter any user/password and hit accept.

## Deploy to Cloudflare

1. `npx wrangler@latest kv namespace create remote-mcp-server-oauth-kv`
2. Follow the guidance to add the kv namespace ID to `wrangler.jsonc`
3. `npm run deploy`

## Call your newly deployed remote MCP server from a remote MCP client

Just like you did above in "Develop locally", run the MCP inspector:

`npx @modelcontextprotocol/inspector@latest`

Then enter the `workers.dev` URL (ex: `worker-name.account-name.workers.dev/sse`) of your Worker in the inspector as the URL of the MCP server to connect to, and click "Connect".

You've now connected to your MCP server from a remote MCP client.