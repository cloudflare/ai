# Cloudflare AI

Packages and examples for building AI-powered applications on Cloudflare. Includes providers for the [Vercel AI SDK](https://sdk.vercel.ai/) and [TanStack AI](https://tanstack.com/ai), with support for [Workers AI](https://ai.cloudflare.com/), [AI Gateway](https://developers.cloudflare.com/ai-gateway/), and [AI Search](https://developers.cloudflare.com/ai-search/).

## Packages

| Package                                                  | Description                                                                                                                                                                                                                                                               | npm                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [`workers-ai-provider`](./packages/workers-ai-provider/) | Workers AI provider for the Vercel AI SDK. Chat, image generation, embeddings, transcription, text-to-speech, and reranking — plus the AI Gateway delegate (unified catalog, resume _(coming soon)_, server-side fallback). [Docs](./docs/workers-ai-provider/README.md). | [![npm](https://img.shields.io/npm/v/workers-ai-provider)](https://www.npmjs.com/package/workers-ai-provider)         |
| [`ai-search-provider`](./packages/ai-search-provider/)   | AI Search provider for the Vercel AI SDK. Upload files to AI Search for indexing, then search with natural language or generate grounded chat responses. [Docs](./docs/ai-search-provider/README.md).                                     | [![npm](https://img.shields.io/npm/v/ai-search-provider)](https://www.npmjs.com/package/ai-search-provider)           |
| [`@cloudflare/tanstack-ai`](./packages/tanstack-ai/)     | Workers AI and AI Gateway adapters for TanStack AI. Chat, image, transcription, TTS, summarization, plus gateway routing and resumable streaming _(coming soon)_. [Docs](./docs/tanstack-ai/README.md).                                                                   | [![npm](https://img.shields.io/npm/v/@cloudflare/tanstack-ai)](https://www.npmjs.com/package/@cloudflare/tanstack-ai) |
| [`ai-gateway-provider`](./packages/ai-gateway-provider/) | AI Gateway provider for the Vercel AI SDK — wrap pre-built `@ai-sdk/*` models and route them through AI Gateway with caching, retries, and cross-vendor fallback. [Docs](./docs/ai-gateway-provider/README.md).                                                           | [![npm](https://img.shields.io/npm/v/ai-gateway-provider)](https://www.npmjs.com/package/ai-gateway-provider)         |

## Documentation

In-depth guides and API reference live in [`docs/`](./docs/README.md): how the
packages relate, [gateway routing](./docs/concepts/gateway-routing.md),
[resumable streaming](./docs/concepts/resume.md) _(coming soon)_,
[binding vs REST](./docs/concepts/binding-vs-rest.md), and per-package guides.

## Examples

| Example                                           | Description                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`examples/workers-ai`](./examples/workers-ai/)   | Full-featured Workers AI playground using the Vercel AI SDK. Demonstrates all 6 capabilities: chat (with tool calling and reasoning), image generation, embeddings, transcription, text-to-speech, and reranking. Supports both binding and REST API modes. |
| [`examples/tanstack-ai`](./examples/tanstack-ai/) | Multi-provider demo using TanStack AI. Provider-first UI with Workers AI (binding and gateway), OpenAI, Anthropic, Gemini, Grok, and OpenRouter — each with capability sub-tabs for chat, image, summarize, transcription, and TTS.                         |

## Demos

The [`demos/`](./demos/) directory contains additional focused demos for specific patterns — tool calling, structured output, agents, MCP servers, and more.

## Local Development

```bash
# Clone and install
git clone git@github.com:cloudflare/ai.git
cd ai
pnpm install

# Run an example
cd examples/workers-ai
pnpm dev

# Run tests for a package
cd packages/workers-ai-provider
pnpm test

# Run E2E tests (requires Cloudflare credentials)
pnpm test:e2e
```

## Contributing

1. Fork or clone the repo, then `pnpm install` from the root.
2. Create a branch for your change.
3. If your change affects a published package, run `pnpm changeset` and describe what changed.
4. Submit a PR to `main`.

## Release Process

This repo uses [Changesets](https://github.com/changesets/changesets). When a PR with changesets merges to `main`, a "Version Packages" PR is created automatically. Merging that PR bumps versions and publishes to npm.
