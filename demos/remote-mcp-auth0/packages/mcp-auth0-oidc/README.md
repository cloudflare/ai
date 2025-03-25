# Model Context Protocol (MCP) Server

This is a MCP server which will require the user to first authenticate. The MCP server will then be able to call protected APIs on behalf of the user.

## Configuration

### Todos API

Before you can use the MCP server, you will need to deploy the Todos API as documented [here](../todos-api/README.md).

### Auth0 Configuration

In the Auth0 dashboard, create a new application in the Applications section (type: "Regular Web Application").

<img src="../../docs/create-application.jpg" width="500" alt="Create Application">

Once the application is created, configure the following URL as the callback URL when developing locally:

```
http://localhost:8788/callback
```

### Set up a KV namespace

- Create the KV namespace:
  `wrangler kv:namespace create "OAUTH_KV"`
- Update the Wrangler file with the KV ID

## Development

Create a `.dev.vars` file in the root of the project with the following structure:

```
AUTH0_DOMAIN=Your Auth0 domain (eg: acme.auth0.com)
AUTH0_CLIENT_ID=The Client ID of the application you created in Auth0
AUTH0_CLIENT_SECRET=The Client Secret of the application you created in Auth0
AUTH0_AUDIENCE=urn:todos-api
AUTH0_SCOPE=openid email profile offline_access read:todos
NODE_ENV=development
API_BASE_URL=The base URL of the Todos API (eg: https://todos-api.sandrino.run)
```

The `AUTH0_DOMAIN` is the domain of the Auth0 tenant. The `AUTH0_AUDIENCE` is the audience of the API you created in the Auth0 tenant (eg: `urn:todos-api`).

### Testing the MCP Server

To start the MCP server, you can use the following command:

```
pnpm run dev
```

With MCP Inspector you can connect to the MCP server, list the available tools and call them. Make sure to set the transport type to `sse` and the URL to `http://localhost:8788`.

<img src="../../docs/local.jpg" width="500" alt="MCP Inspector">

## Deploying the MCP Server to Cloudflare

To deploy the MCP Server to Cloudflare, you will first need to set the following secrets:

```bash
wrangler secret put AUTH0_DOMAIN
wrangler secret put AUTH0_CLIENT_ID
wrangler secret put AUTH0_CLIENT_SECRET
wrangler secret put AUTH0_AUDIENCE
wrangler secret put AUTH0_SCOPE
wrangler secret put API_BASE_URL
```

Once the secrets are set, you can deploy the API with the following command:

```bash
pnpm run deploy
```

In the Auth0 dashboard, also make sure to add a new Callback URL for your deployed MCP server, eg:

```bash
https://mcp-auth0-oidc.<your-subdomain>.workers.dev/callback
```
