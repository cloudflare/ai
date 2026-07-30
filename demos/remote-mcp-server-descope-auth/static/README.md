# Remote MCP Server with Descope Auth

Let's get a Remote MCP server up-and-running on Cloudflare Workers with Descope OAuth login!

## Prerequisites

Before you begin, ensure you have:

- A [Descope](https://www.descope.com/) account
- A Descope **Inbound App client** (created in **Agentic Identity Hub → Clients**)
- Node.js version `18.x` or higher
- A Cloudflare account (for deployment)

## Develop locally

1. Create an Inbound App client in the Descope Console:
    - Go to **Agentic Identity Hub → Clients** and create a new client.
    - Set the redirect / callback URL to `http://localhost:8787/callback`.
    - From the client's **Connection Information**, copy the **Client ID** and **Client Secret**.
    - Under **User information scopes**, define the scopes the server requests (mapped to a user attribute):
        - `email` → **Email** attribute
        - `profile` → **Display Name** attribute
    - (`openid` is built-in and is required for `getUserInfo` to work. Scopes requested at `/authorize` must be pre-defined on the Inbound App.)

2. Create a KV namespace for OAuth state storage:

```bash
npx wrangler kv namespace create OAUTH_KV
# Copy the ID and update wrangler.jsonc
```

3. Create a `.dev.vars` file in your project root (this file is gitignored):

```bash
# .dev.vars
DESCOPE_CLIENT_ID="your_inbound_app_client_id"
DESCOPE_CLIENT_SECRET="your_inbound_app_client_secret"
COOKIE_ENCRYPTION_KEY="your_cookie_encryption_key"   # openssl rand -hex 32
```

4. Clone and set up the repository:

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
2. [Within the inspector](http://localhost:5173), set the Transport Type to `Streamable HTTP` and enter `http://localhost:8787/mcp` as the URL of the MCP server to connect to.
3. Click "Connect" (or run the **Quick OAuth Flow** from the Authentication panel). The inspector registers itself via Dynamic Client Registration, then redirects you to Descope to log in — no manual bearer token needed.
4. After you authenticate, click "List Tools".
5. Run the "getUserInfo" tool to see your authenticated Descope profile, or "getToken" to see the Descope access token the server received.

> **Note:** The `SSE` transport is deprecated. This server exposes the modern **Streamable HTTP** transport at `/mcp`.

## Deploy to Cloudflare

1. Create a KV namespace for production:

```bash
npx wrangler kv namespace create OAUTH_KV
# Copy the returned ID into the production kv_namespaces binding in wrangler.jsonc
```

2. Set up your secrets in Cloudflare:

```bash
# Set Descope Inbound App credentials as secrets
npx wrangler secret put DESCOPE_CLIENT_ID
npx wrangler secret put DESCOPE_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY
```

3. Deploy the worker:

```bash
npm run deploy
```

After deploying, add your production callback URL (`https://<worker>.workers.dev/callback`) to the Inbound App client's redirect URLs in **Agentic Identity Hub → Clients**.

## Call your newly deployed remote MCP server from a remote MCP client

Just like you did above in "Develop locally", run the MCP inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

Then, using the `Streamable HTTP` transport, enter the `workers.dev` URL (ex: `https://worker-name.account-name.workers.dev/mcp`) of your Worker in the inspector as the URL of the MCP server to connect to, and click "Connect".

You've now connected to your MCP server from a remote MCP client. Authentication runs through the Descope OAuth flow.

## Features

The MCP server implementation includes:

- 🔐 OAuth 2.0/2.1 Authorization Server Metadata (RFC 8414)
- 🔑 Dynamic Client Registration (RFC 7591)
- 🔒 PKCE Support
- 📝 Bearer Token Authentication
