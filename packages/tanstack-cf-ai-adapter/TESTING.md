# Testing Guide

The best way to test `@harshil1712/tanstack-cf-ai-adapter` is through the included example application.

## Quick Start

```bash
cd example
npm install
npm run dev
```

Then visit http://localhost:5173 in your browser.

## Full Documentation

See [example/README.md](./example/README.md) for:

- Complete setup instructions
- How to configure AI Gateway
- Adding API keys as secrets
- API endpoint documentation
- Deployment guide
- Troubleshooting

## Example Features

The example includes:

- **Full-stack application** with Hono + React + Vite
- **Multiple AI providers** (Anthropic, OpenAI)
- **Streaming responses** using Hono's `streamText()`
- **TypeScript** with generated Worker binding types
- **Production-ready** configuration

## What to Test

1. **Gateway URL Generation**
   ```bash
   curl http://localhost:8787/api/gateway-url/anthropic
   ```

2. **Streaming AI Responses**
   ```bash
   curl http://localhost:8787/api/anthropic
   curl http://localhost:8787/api/openai
   ```

3. **Verify in Dashboard**
   - Go to Cloudflare Dashboard → AI → AI Gateway
   - Check Logs tab for your requests
   - Verify analytics are tracking

## Standalone Code Examples

If you prefer standalone examples without the full-stack setup, see [`example.ts`](./example.ts) for simple code snippets showing:

- Basic usage with standard authentication
- Multiple providers
- BYOK (Bring Your Own Keys)
- Unified Billing
- Advanced features (caching, metadata)

## Need Help?

- Check [example/README.md](./example/README.md) for troubleshooting
- See [README.md](./README.md) for package limitations
- Open an issue on [GitHub](https://github.com/harshil1712/tanstack-cf-ai-adapter)
