# Slack OAuth MCP

This is a Model Context Protocol (MCP) server that provides read-only access to your Slack data using OAuth.

## Features

- Read-only access to Slack channels and messages
- Daily summaries of important messages
- Demonstration of secure OAuth scoping

## Available Tools

- `whoami`: Get information about your Slack user
- `listChannels`: Get a list of channels from your Slack workspace
- `getChannelMessages`: Get recent messages from a specific channel
- `getDailyUpdate`: Get a daily summary of important Slack messages
- `postMessage`: Attempt to post a message (will fail with read-only permissions)

## Setup

### 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" and give your app a name
3. Select the workspace where you want to install the app

### 2. Configure OAuth Settings

1. In the left sidebar, click on "OAuth & Permissions"
2. Add the following scopes under "Bot Token Scopes":
   - `channels:history`
   - `channels:read`
   - `users:read`
3. Add your redirect URL: `https://<your-worker-domain>/callback`
4. Make note of your Client ID and Client Secret from the "Basic Information" page

### 3. Deploy to Cloudflare Workers

1. Update the `wrangler.jsonc` file with your Slack Client ID and Client Secret:
   ```json
   "vars": {
     "SLACK_CLIENT_ID": "your-slack-client-id",
     "SLACK_CLIENT_SECRET": "your-slack-client-secret"
   }
   ```

2. Create a KV namespace for OAuth token storage:
   ```bash
   wrangler kv:namespace create OAUTH_KV
   ```

3. Update the KV namespace ID in `wrangler.jsonc` with the ID you received:
   ```json
   "kv_namespaces": [
     {
       "binding": "OAUTH_KV",
       "id": "your-kv-namespace-id"
     }
   ]
   ```

4. Deploy the worker:
   ```bash
   npm run deploy
   ```

## Usage

To use this service, connect to the SSE endpoint in your MCP client:

```
https://<your-worker-domain>/sse
```

You'll be prompted to authorize with Slack, and then you can use the available tools to access your Slack data.

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## Security

This implementation uses OAuth for authentication and authorization, with the following security features:

- Uses minimal read-only scopes to limit access
- Implements CSRF protection with state parameter
- Stores OAuth tokens securely in Cloudflare KV
- Demonstrates proper access control with the postMessage example