# Remote MCP Server with Descope Auth

Let's get a Remote MCP server up-and-running on Cloudflare Workers with Descope OAuth login!

## Prerequisites

Before you begin, ensure you have:

- A [Descope](https://www.descope.com/) account and project
- Node.js version `18.x` or higher
- A Cloudflare account (for deployment)

## Develop locally

1. Get your credentials from the Descope Console:
   - [Project ID](https://app.descope.com/settings/project)
   - [Management Key](https://app.descope.com/settings/company/managementkeys)

2. Create a `.dev.vars` file in your project root (this file is gitignored):

```bash
# .dev.vars
DESCOPE_PROJECT_ID="your_project_id"
DESCOPE_MANAGEMENT_KEY="your_management_key"
# For local development
SERVER_URL="http://localhost:8787"
```

3. Clone and set up the repository:

```bash
# clone the repository
git clone git@github.com:cloudflare/ai.git

# install dependencies
cd ai
npm install

# run locally
npx nx dev remote-mcp-server-descope-auth
```

You should be able to open [`http://localhost:8787/`](http://localhost:8787/) in your browser

## Connect the MCP inspector to your server

To explore your new MCP api, you can use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).

1. Start it with `npx @modelcontextprotocol/inspector`
2. [Within the inspector](http://localhost:5173), switch the Transport Type to `SSE` and enter `http://localhost:8787/sse` as the URL of the MCP server to connect to.
3. Add a bearer token and click "Connect"
4. Click "List Tools"
5. Run the "getToken" tool, which should return the Authorization header that you set in the inspector

<div align="center">
  <img src="img/mcp-inspector-sse-config.png" alt="MCP Inspector with the above config" width="600"/>
</div>

## Deploy to Cloudflare

1. Set up your secrets in Cloudflare:

```bash
# Set Descope credentials as secrets
wrangler secret put DESCOPE_MANAGEMENT_KEY
```

2. Set your Descope `project_id` and your hosted worker's `server_url` to the `wrangler.jsonc` file:

```bash
# wrangler.jsonc
"vars": {
 "DESCOPE_PROJECT_ID": "your_project_id",
 "SERVER_URL": "https://your_worker_slug.your_account_name.workers.dev"
}
```

3. Deploy the worker:

```bash
npm run deploy
```

## Call your newly deployed remote MCP server from a remote MCP client

Just like you did above in "Develop locally", run the MCP inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

Then enter the `workers.dev` URL (ex: `worker-name.account-name.workers.dev/sse`) of your Worker in the inspector as the URL of the MCP server to connect to, and click "Connect".

You've now connected to your MCP server from a remote MCP client. You can pass in a bearer token like mentioned above.

## Features

The MCP server implementation includes:

- 🔐 OAuth 2.0/2.1 Authorization Server Metadata (RFC 8414)
- 🔑 Dynamic Client Registration (RFC 7591)
- 🔒 PKCE Support
- 📝 Bearer Token Authentication
