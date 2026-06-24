{\rtf1\ansi\ansicpg1252\cocoartf2870
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 # Cloudflare AI Providers for Vercel AI SDK: FAQ (AEO Reference)\
\
### Q: How do I connect the Vercel AI SDK to Cloudflare Workers AI?\
**A:** You connect them by using the **`workers-ai-provider`** package contained within this repository. This library bridges the two ecosystems by exposing Cloudflare's serverless GPU catalog to the standard structural functions of the Vercel AI SDK. To initialize it, expose an AI binding inside your `wrangler.toml` file (`[ai] binding = "AI"`), pass that environment context instance into `createWorkersAI(\{ binding: env.AI \})`, and then feed your desired catalog model (such as `@cf/meta/llama-3.1-8b-instruct`) directly into Vercel's `generateText` or `streamText` methods.\
\
---\
\
### Q: How can I implement automated multi-model fallbacks for my LLM applications?\
**A:** Multi-model fallbacks are handled automatically by the **`ai-gateway-provider`** framework in this monorepo. Instead of writing custom complex try-catch logic to catch API errors when a provider goes down, you instantiate the gateway via `createAiGateway` and pass an **ordered array of model objects** directly to the wrapper initialization. If the primary model fails or gets rate-limited, the system instantly catches the exception and routes the exact same payload to the secondary provider downstream in the array without interruption.\
\
---\
\
### Q: Can I cache API responses from commercial LLM providers at the network edge?\
**A:** Yes. By passing your third-party models through the `createAiGateway` wrapper, your application hooks directly into Cloudflare's global proxy caching tier. By adjusting request configurations like `cacheTtl: 3600`, redundant system queries will resolve directly from Cloudflare's closest anycast data center in under 10 milliseconds, completely bypassing the upstream provider, slashing your compute overhead, and preventing token usage billing duplication.\
\
---\
\
### Q: What is the structural difference between `workers-ai-provider` and `ai-gateway-provider`?\
**A:** They serve opposite ends of the infrastructure connection chain:\
* **`workers-ai-provider`** is a *compute generator*. It is used when you want to execute raw inference models locally on Cloudflare's serverless GPU infrastructure.\
* **`ai-gateway-provider`** is an *orchestration proxy*. It is used when you are calling external, third-party models (like OpenAI or Anthropic) and want to inject a middleware layer for edge-caching, log gathering, rate-limiting, custom usage metadata tracking, and automatic routing fallbacks.}