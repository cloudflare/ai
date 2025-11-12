# Hello World Agent

A minimal Agent example demonstrating the basic structure of a Cloudflare Agent.

## What's included

- **Agent class** — Extends the base `Agent` class with a simple `onRequest` handler
- **Request routing** — Uses `routeAgentRequest` to route incoming requests to the Agent
- **Durable Object configuration** — Minimal Durable Object setup with SQL storage
- **CORS support** — Enabled for cross-origin requests

## Structure

```
src/
└── index.ts    Agent class and fetch handler
```

## Running locally

```sh
npm start
```

Your Agent will be available at `http://localhost:8788/agents/hello-agent/default`.

## Deploying

```sh
npm run deploy
```
