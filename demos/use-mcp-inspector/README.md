# MCP Inspector

A minimal demo showcasing the `use-mcp` React hook for connecting to Model Context Protocol (MCP) servers.

## Features

- Connect to any MCP server via URL
- View available tools and their schemas
- Real-time connection status monitoring
- Debug logging for troubleshooting
- Clean, minimal UI focused on MCP functionality

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the development server:
   ```bash
   pnpm dev
   ```

3. Open your browser and navigate to the displayed local URL

4. Enter an MCP server URL to test the connection and explore available tools

## What This Demonstrates

This example shows how easy it is to integrate MCP servers into a React application using the `use-mcp` hook. The core functionality is just:

```tsx
import { useMcp } from 'use-mcp/react'

const connection = useMcp({
  url: 'your-mcp-server-url',
  debug: true,
  autoRetry: false
})

// Access connection.state, connection.tools, connection.error, etc.
```

The `McpServers` component wraps this hook to provide a complete UI for server management and tool inspection.
