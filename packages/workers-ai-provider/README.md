# ⛅️ ✨ workers-ai-provider ✨ ⛅️

A custom provider that enables [Workers AI](https://ai.cloudflare.com/)'s models for the [Vercel AI SDK](https://sdk.vercel.ai/).

## Install

```bash
npm install workers-ai-provider
```

## Usage

First, setup an AI binding in `wrangler.toml` in your Workers project:

```toml
# ...
[ai]
binding = "AI"
# ...
```

### Using Workers AI

Then in your Worker, import the factory function and create a new AI provider:

```ts
import { createWorkersAI } from "workers-ai-provider";
import { streamText } from "ai";

type Env = {
  AI: Ai;
};

export default {
  async fetch(req: Request, env: Env) {
    const workersai = createWorkersAI({ binding: env.AI });
    // Use the AI provider to interact with the Vercel AI SDK
    // Here, we generate a chat stream based on a prompt
    const text = await streamText({
      model: workersai("@cf/meta/llama-2-7b-chat-int8"),
      messages: [
        {
          role: "user",
          content: "Write an essay about hello world",
        },
      ],
    });

    return text.toTextStreamResponse({
      headers: {
        // add these headers to ensure that the
        // response is chunked and streamed
        "Content-Type": "text/x-unknown",
        "content-encoding": "identity",
        "transfer-encoding": "chunked",
      },
    });
  },
};
```

You can also use your Cloudflare credentials to create the provider, for example if you want to use Cloudflare AI outside of the Worker environment. For example, here is how you can use Cloudflare AI in a Node script:

```js
const workersai = createWorkersAI({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  apiKey: process.env.CLOUDFLARE_API_KEY
});

const text = await streamText({
  model: workersai("@cf/meta/llama-2-7b-chat-int8"),
  messages: [
    {
      role: "user",
      content: "Write an essay about hello world",
    },
  ],
});
```

### Using generateText for Non-Streaming Responses

If you prefer to get a complete text response rather than a stream, you can use the `generateText` function:

```ts
import { createWorkersAI } from "workers-ai-provider";
import { generateText } from "ai";

type Env = {
  AI: Ai;
};

export default {
  async fetch(req: Request, env: Env) {
    const workersai = createWorkersAI({ binding: env.AI });
    
    const { text } = await generateText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      prompt: "Write a short poem about clouds",
    });

    return new Response(JSON.stringify({ generatedText: text }), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  },
};
```

### Using AutoRAG

The provider now supports [Cloudflare's AutoRAG](https://developers.cloudflare.com/autorag/), allowing you to prompt your AutoRAG models directly from the Vercel AI SDK. Here's how to use it in your Worker:

```ts
import { createAutoRAG } from "workers-ai-provider";
import { streamText } from "ai";

type Env = {
  AI: Ai;
};

export default {
  async fetch(req: Request, env: Env) {
    const autorag = createAutoRAG({ binding: env.AI.autorag('my-rag-name') });

    const text = await streamText({
      model: autorag("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      messages: [
        {
          role: "user",
          content: "How to setup AI Gateway?",
        },
      ],
    });

    return text.toTextStreamResponse({
      headers: {
        // add these headers to ensure that the
        // response is chunked and streamed
        "Content-Type": "text/x-unknown",
        "content-encoding": "identity",
        "transfer-encoding": "chunked",
      },
    });
  },
};
```

For more info, refer to the documentation of the [Vercel AI SDK](https://sdk.vercel.ai/).

### Credits

Based on work by [Dhravya Shah](https://twitter.com/DhravyaShah) and the Workers AI team at Cloudflare.
