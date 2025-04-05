# Model Context Protocol (MCP) Server

This is a MCP server which will require the user to first authenticate. The MCP server will then be able to call protected APIs on behalf of the user.

## Configuration

### Todos API

Before you can use the MCP server, you will need to deploy the Todos API as documented [here](../todos-api/README.md).

### Auth0 Configuration

In the Auth0 dashboard, create a new application in the Applications section (type: "Regular Web Application").

<img src="../docs/create-application.jpg" width="500" alt="Create Application">

Once the application is created, configure the following URL as the callback URL when developing locally:

```
http://localhost:8788/callback
```

### Set up a KV namespace

- Create the KV namespace:
  `wrangler kv:namespace create "OAUTH_KV"`
- Update the Wrangler file with the KV ID

## Environment Variables

This MCP Server needs a few environment variables to be configured:

| Setting               | Description                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH0_DOMAIN`        | The domain of your Auth0 tenant (e.g., `acme.auth0.com`)                                                                                                                        |
| `AUTH0_CLIENT_ID`     | The Client ID from the Auth0 application you created                                                                                                                            |
| `AUTH0_CLIENT_SECRET` | The Client Secret from the Auth0 application you created                                                                                                                        |
| `AUTH0_AUDIENCE`      | The unique identifier for your API which you registered in the Auth0 dashbaord (e.g., `urn:todos-api`)                                                                          |
| `AUTH0_SCOPE`         | The scopes requested by the MCP Server. Here we request basic profile info (`openid email profile`), refresh token capability (`offline_access`), and API access (`read:todos`) |
| `NODE_ENV`            | The environment setting - use `development` for local development                                                                                                               |
| `API_BASE_URL`        | The base URL where your Todos API is running                                                                                                                                    |

## Development

Create a `.dev.vars` file in the root of the project with the following structure:

```
AUTH0_DOMAIN=yourdomain.us.auth0.com
AUTH0_CLIENT_ID=The Client ID of the application you created in Auth0
AUTH0_CLIENT_SECRET=The Client Secret of the application you created in Auth0
AUTH0_AUDIENCE=urn:todos-api
AUTH0_SCOPE=openid email profile offline_access read:todos
NODE_ENV=development
API_BASE_URL=http://localhost:8789
```

### Testing the MCP Server

To start the MCP server, you can use the following command:

```
npm run dev
```

With MCP Inspector you can connect to the MCP server, list the available tools and call them. Make sure to set the transport type to `sse` and the URL to `http://localhost:8788/sse`.

<img src="../docs/local.jpg" width="750" alt="MCP Inspector">

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
npm run deploy
```

In the Auth0 dashboard, also make sure to add a new Callback URL for your deployed MCP server, eg:

```bash
https://mcp-auth0-oidc.<your-subdomain>.workers.dev/callback
```

To test this you can now use the Workers AI LLM Playground. Navigate to [https://playground.ai.cloudflare.com/](https://playground.ai.cloudflare.com/) and connect to your MCP server on the bottom left using the following URL pattern:

```bash
https://mcp-auth0-oidc.<your-subdomain>.workers.dev/sse
```

This will open a popup where you can sign in after which you'll be able to use all of the tools.

<img src="../docs/playground.png" width="750" alt="Workers AI LLM Playground">

## Troubleshooting

If you encounter any issues while setting up or using the MCP server, here are some troubleshooting steps:

**Check Worker Logs**

Visit the [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/) in your dashboard

**Auth0 Dashboard Logs**

- Navigate to the Logs section in your Auth0 Dashboard
- Review authentication attempts and failures

<img src="../docs/troubleshooting.png" width="750" alt="Auth0 Logs">

**Common Issues**

- If authentication fails, verify your Auth0 configuration and secrets
- For connection issues, ensure your Worker is deployed and the domain is correct
- Check that all callback URLs are properly configured in Auth0
- Verify the API_BASE_URL matches your deployed API endpoint
