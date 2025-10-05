# Model Context Protocol (MCP) Server (SSOJet)

This is a **Model Context Protocol (MCP)** server powered by **SSOJet** for authentication. Users must first sign in with SSOJet. Once authenticated, they can access and use secure tools such as the `add` tool exposed by this server.

---

## Configuration

### SSOJet Setup

1. Go to your **SSOJet dashboard**.
2. Create a new **Single page web application**.
3. Set the callback URL for local development:

```
http://localhost:8788/callback
```

4. Note the following details from your app:

   * **Client ID**
   * **Client Secret**
   * **Issuer URL** (e.g. `https://<your-tenant>.auth.ssojet.com/v1/`)

These will be used to configure your server.

---

### Set up a KV Namespace

This project uses a Cloudflare KV namespace to store token metadata:

```bash
wrangler kv:namespace create "OAUTH_KV"
```

Then, add the KV binding to your `wrangler.jsonc`.

---

## Environment Variables

The following environment variables must be configured to run the server:

| Variable               | Description                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| `SSOJET_CLIENT_ID`     | The Client ID from your SSOJet application                              |
| `SSOJET_CLIENT_SECRET` | The Client Secret from your SSOJet application                          |
| `SSOJET_ISSUER`        | The issuer URL (e.g. `https://<your-tenant>.auth.ssojet.com/v1/`)       |
| `SSOJET_SCOPE`         | Scopes to request (e.g. `openid profile email`)                         |
| `NODE_ENV`             | Use `development` for local development                                 |
| `API_BASE_URL`         | Not required in this case (unless your tool makes API calls externally) |

---

## Development

Create a `.dev.vars` file in the root of your project:

```env
SSOJET_CLIENT_ID=<your_ssojet_client_id>
SSOJET_CLIENT_SECRET=<your_ssojet_client_secret>
SSOJET_ISSUER=https://<your-tenant>.auth.ssojet.com/v1/
SSOJET_SCOPE="openid profile email"
NODE_ENV=development
```

Then run the MCP server locally:

```bash
npm run dev
```

---

## Tool Available

The server currently provides a single tool:

| Tool  | Description                                                   |
| ----- | ------------------------------------------------------------- |
| `add` | Adds two numbers together. Useful for simple math operations. |

Once the user signs in via SSOJet, this tool becomes accessible through compatible MCP clients such as the Workers AI LLM Playground.

---

## Testing with MCP Inspector

You can test your server locally with [MCP Inspector](https://playground.ai.cloudflare.com/):

1. Set the **Transport** to `sse`
2. Set the **URL** to:

   ```
   http://localhost:8788/sse
   ```
3. A popup will appear for SSOJet authentication
4. Once logged in, you’ll see the available tools

---

## Deploying to Cloudflare

Before deploying, set the necessary secrets in your Cloudflare environment:

```bash
wrangler secret put SSOJET_CLIENT_ID
wrangler secret put SSOJET_CLIENT_SECRET
wrangler secret put SSOJET_ISSUER
wrangler secret put SSOJET_SCOPE
```

Deploy with:

```bash
npm run deploy
```

Then, in the **SSOJet dashboard**, add your deployed callback URL:

```
https://mcp-ssojet-oidc.<your-subdomain>.workers.dev/callback
```

To use the deployed server with MCP Inspector or the LLM Playground, use this endpoint:

```
https://mcp-ssojet-oidc.<your-subdomain>.workers.dev/sse
```

---

## Troubleshooting

### Cloudflare Worker Logs

You can inspect logs and errors using Cloudflare’s observability dashboard:

🔗 [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/)

### SSOJet Logs

Visit your SSOJet dashboard and check the **Logs** section to diagnose authentication issues.

---

## Common Issues

* ❌ **Invalid credentials**: Double-check that secrets match your SSOJet application.
* ❌ **Missing callback URL**: Ensure all callback URLs are added in your SSOJet dashboard.
* ❌ **Tool not showing**: Make sure you're authenticated and using the correct endpoint.
* ❌ **Local connection failed**: Ensure the MCP server is running on `http://localhost:8788`.

---

