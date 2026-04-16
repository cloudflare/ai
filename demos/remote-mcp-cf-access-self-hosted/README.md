# MCP Server + Access Self-Hosted App

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server protected by Cloudflare Access as a self-hosted application. Unlike the [Access for SaaS demo](../remote-mcp-cf-access/), this approach requires **no OAuth implementation** — Cloudflare Access handles authentication automatically.

The MCP server demonstrates:

- Validating the Access JWT signature against your team's public keys using [`jose`](https://www.npmjs.com/package/jose)
- Verifying the JWT issuer and audience claims
- Reading user identity from the validated JWT
- Conditionally exposing tools based on user identity

## Getting Started

Clone the repo and install dependencies:

```bash
npm install
```

### Create a self-hosted Access application

1. In [Cloudflare One](https://one.dash.cloudflare.com), go to **Access controls** > **Applications** > **Add an application** > **Self-hosted**.
2. Set the **Application domain** to your Worker URL (e.g., `mcp-access-self-hosted.<your-subdomain>.workers.dev`).
3. Add an Access policy to control who can connect (e.g., allow emails ending in `@yourcompany.com`).

### Configure environment variables

Update `wrangler.jsonc` with your Access application details:

- `TEAM_DOMAIN`: Your Cloudflare One team domain (e.g., `https://<your-team-name>.cloudflareaccess.com`)
- `POLICY_AUD`: Your application's [AUD tag](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag) (found under **Access controls** > **Applications** > your app > **Basic information**)

### Deploy

```bash
wrangler deploy
```

### Test

Test the remote server using [Inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
npx @modelcontextprotocol/inspector@latest
```

Enter `https://mcp-access-self-hosted.<your-subdomain>.workers.dev/mcp` and connect. You will be prompted to log in through your Access identity provider.

### Connect from Claude Desktop

Open Claude Desktop, go to Settings > Developer > Edit Config, and add:

```json
{
  "mcpServers": {
    "access-self-hosted": {
      "type": "http",
      "url": "https://mcp-access-self-hosted.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

### Local Development

```bash
wrangler dev
```

Note: In local development, `Cf-Access-Jwt-Assertion` is not set by Access. You can test by manually setting the header or by using `cloudflared access` to tunnel through Access.
