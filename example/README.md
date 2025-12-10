# TanStack AI + Cloudflare AI Gateway Example

This example demonstrates using `@harshil1712/tanstack-cf-ai-adapter` with a full-stack Hono + React + Vite application.

## Stack

- **Worker**: Hono framework
- **Frontend**: React + Vite
- **AI**: TanStack AI with Cloudflare AI Gateway adapter
- **Deployment**: Cloudflare Workers

## Prerequisites

1. **Cloudflare Account** with AI Gateway access
2. **AI Gateway** created in Cloudflare Dashboard
   - Go to [AI → AI Gateway](https://dash.cloudflare.com/)
   - Create a gateway named `my-gateway` (or update `worker/index.ts` with your name)
3. **API Keys** for AI providers:
   - Anthropic API key (for Claude)
   - OpenAI API key (for GPT models)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Add API Keys as Secrets

```bash
# Add Anthropic API key
wrangler secret put ANTHROPIC_API_KEY
# Paste your Anthropic API key when prompted

# Add OpenAI API key
wrangler secret put OPENAI_API_KEY
# Paste your OpenAI API key when prompted
```

### 3. Generate Types

```bash
npm run cf-typegen
```

This generates TypeScript types for your Worker bindings in `worker-configuration.d.ts`.

## Development

### Run Locally

```bash
npm run dev
```

This starts:
- Vite dev server for the React frontend
- Wrangler dev server for the Worker

Open http://localhost:5173 in your browser.

### API Endpoints

The Worker provides these API endpoints:

- `GET /api/` - API info
- `GET /api/anthropic` - Test Anthropic (Claude) with streaming
- `GET /api/openai` - Test OpenAI (GPT) with streaming
- `GET /api/gateway-url/:provider` - Get gateway URL for a provider

### Test with cURL

```bash
# Test Anthropic
curl http://localhost:8787/api/anthropic

# Test OpenAI
curl http://localhost:8787/api/openai

# Get gateway URL
curl http://localhost:8787/api/gateway-url/anthropic
```

## Deployment

### Build and Deploy

```bash
npm run deploy
```

This will:
1. Build the React frontend
2. Build the Worker
3. Deploy to Cloudflare Workers

Your app will be available at `https://example.YOUR_SUBDOMAIN.workers.dev`

### Preview Before Deploy

```bash
npm run preview
```

## Configuration

### Update Gateway Name

If your AI Gateway has a different name, update it in `worker/index.ts`:

```typescript
const gateway = withAiGateway(c.env.AI, "your-gateway-name");
```

### Add More Providers

To add support for other providers (Gemini, Groq, etc.):

1. Install the provider adapter:
   ```bash
   npm install @tanstack/ai-gemini
   ```

2. Add to `worker/index.ts`:
   ```typescript
   import { gemini } from "@tanstack/ai-gemini";

   app.get("/api/gemini", async (c) => {
     const gateway = withAiGateway(c.env.AI, "my-gateway");
     const ai = new AI({
       adapters: {
         gemini: await gateway(gemini, {
           apiKey: c.env.GEMINI_API_KEY,
         }),
       },
     });
     // ... rest of implementation
   });
   ```

3. Add the secret:
   ```bash
   wrangler secret put GEMINI_API_KEY
   ```

## Verification

After running the example:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **AI** → **AI Gateway** → **my-gateway**
2. Check the **Logs** tab
3. You should see your requests with:
   - Provider (anthropic, openai)
   - Model used
   - Tokens consumed
   - Response time
   - Status codes
4. Check **Analytics** for usage trends and costs

## Project Structure

```
example/
├── worker/
│   └── index.ts          # Hono Worker with adapter examples
├── src/                  # React frontend source
├── public/               # Static assets
├── index.html           # Frontend entry point
├── wrangler.jsonc       # Cloudflare Workers configuration
├── vite.config.ts       # Vite configuration
├── package.json         # Dependencies and scripts
└── README.md           # This file
```

## How It Works

1. **Frontend** makes requests to `/api/*` endpoints
2. **Worker** (Hono) handles the requests
3. **Adapter** wraps TanStack AI adapters with `withAiGateway()`
4. **Requests** are routed through Cloudflare AI Gateway
5. **Gateway** provides caching, analytics, rate limiting
6. **Responses** are streamed back using Hono's `streamText()`

## Troubleshooting

### "AI binding is undefined"
- Check that `ai.binding = "AI"` is in `wrangler.jsonc`
- Run `npm run cf-typegen` to regenerate types

### "Failed to get AI Gateway URL"
- Verify gateway name matches your dashboard
- Check that the gateway supports the provider you're using

### "Missing API key"
- Run `wrangler secret put ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- Secrets are stored per-environment (development/production)

### Type errors
- Run `npm run cf-typegen` after modifying `wrangler.jsonc`
- Check that types in `worker-configuration.d.ts` are up to date

## Learn More

- [TanStack AI Documentation](https://tanstack.com/ai)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
- [Hono Documentation](https://hono.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Package Repository](https://github.com/harshil1712/tanstack-cf-ai-adapter)
