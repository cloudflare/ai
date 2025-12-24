# Workers + Scalekit TODO App MCP Server

This is a Workers server that composes three functions:
* A static website built using React and Vite on top of [Worker Assets](https://developers.cloudflare.com/workers/static-assets/)
* A REST API built using Hono on top of [Workers KV](https://developers.cloudflare.com/kv/) 
* A [Model Context Protocol](https://modelcontextprotocol.io/introduction) Server built using on top of [Workers Durable Objects](https://developers.cloudflare.com/durable-objects/)

User and client identity is managed using [Scalekit](https://scalekit.com/). Put together, these three features show how to extend a traditional full-stack application for use by an AI agent.

This demo uses [Scalekit's MCP Auth](https://docs.scalekit.com/authenticate/mcp/overview/) product, which provides OAuth 2.1 authorization for MCP servers with support for dynamic client registration and CIMD (Client-Initiated Metadata Discovery).

> [!WARNING]
> This is a demo template designed to help you get started quickly. While we have implemented several security controls, **you must implement all preventive and defense-in-depth security measures before deploying to production**. Please review our comprehensive security guide: [Securing MCP Servers](https://github.com/cloudflare/agents/blob/main/docs/securing-mcp-servers.md)


## Set up

Follow the steps below to get this application fully functional and running using your own Scalekit credentials.

### In the Scalekit Dashboard

1. Create a [Scalekit](https://scalekit.com/) account and set up your organization.

2. Navigate to **Settings > API Config** in your Scalekit dashboard to retrieve your credentials:
   - **Client ID**
   - **Client Secret**
   - **Environment URL** (e.g., `https://your-org.scalekit.com`)

3. Configure your MCP server in Scalekit:
   - Register your MCP server application
   - Set up OAuth 2.1 authorization endpoints
   - Configure allowed redirect URIs (e.g., `http://localhost:3000/authenticate` for local development)
   - Enable Dynamic Client Registration if needed

4. For detailed MCP setup instructions, see the [Scalekit MCP Auth Quickstart](https://docs.scalekit.com/authenticate/mcp/quickstart/)

### On your machine

In your terminal clone the project and install dependencies:

```bash
git clone https://github.com/cloudflare/ai.git
cd ai
npm i
cd demos/mcp-scalekit-todo-list
```

Next, create an `.env.local` file by running the command below which copies the contents of `.env.template`.

```bash
cp .env.template .env.local
```

Open `.env.local` in the text editor of your choice, and set the environment variables using your Scalekit credentials:

```env
# This is what a completed .env.local file will look like
VITE_SCALEKIT_CLIENT_ID=your_scalekit_client_id
VITE_SCALEKIT_ENVIRONMENT_URL=https://your-org.scalekit.com
```

Create a `.dev.vars` file by running the command below which copies the contents of `.dev.vars.template`.

```bash
cp .dev.vars.template .dev.vars
```

Open `.dev.vars` in the text editor of your choice, and set the environment variables using your Scalekit credentials:

```env
# This is what a completed .dev.vars file will look like
SCALEKIT_CLIENT_ID=your_scalekit_client_id
SCALEKIT_CLIENT_SECRET=your_scalekit_client_secret
SCALEKIT_ENVIRONMENT_URL=https://your-org.scalekit.com
```

## Running locally

After completing all the setup steps above the application can be run with the command:

```bash
npm run dev
```

The application will be available at [`http://localhost:3000`](http://localhost:3000) and the MCP server will be available at `http://localhost:3000/mcp`.

Test your MCP server using the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
```bash
npx @modelcontextprotocol/inspector@latest
```

Navigate to the URL where the Inspector is running, and input the following values:
- Transport Type: `Streamable HTTP`
- URL: `http://localhost:3000/mcp`

##  Deploy to Cloudflare Workers

Click the button - **you'll need to configure environment variables after the initial deployment**. 

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/ai/tree/main/demos/mcp-scalekit-todo-list)

Or, if you want to follow the steps by hand: 

1. Create a KV namespace for the TODO app to use

```
wrangler kv namespace create TODOS
```

2. Update the KV namespace ID in `wrangler.jsonc` with the ID you received:

```
"kv_namespaces": [
   {
      "binding": "TODOS",
      "id": "your-kv-namespace-id"
   }
]
```


3. Upload your Scalekit Env Vars for use by the worker

```bash
npx wrangler secret bulk .dev.vars
```

4. Deploy the worker

```
npm run deploy
```

5. Grant your deployment access to your Scalekit project. Assuming your deployment is at `https://mcp-scalekit-todo-list.$YOUR_ACCOUNT_NAME.workers.dev`:
   1. Add `https://mcp-scalekit-todo-list.$YOUR_ACCOUNT_NAME.workers.dev/authenticate` as an allowed redirect URI in your Scalekit dashboard
   2. Configure your Scalekit application to allow requests from your deployment domain

## Get help and join the community

#### 📚 Scalekit Documentation

- [MCP Auth Overview](https://docs.scalekit.com/authenticate/mcp/overview/)
- [MCP Auth Quickstart](https://docs.scalekit.com/authenticate/mcp/quickstart/)
- [Scalekit Documentation](https://docs.scalekit.com/)
