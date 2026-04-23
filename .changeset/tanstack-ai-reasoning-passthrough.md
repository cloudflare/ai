---
"@cloudflare/tanstack-ai": minor
---

Add passthrough for `reasoning_effort` and `chat_template_kwargs` in `createWorkersAiChat`. Pass them per-call through `modelOptions`:

```ts
const adapter = createWorkersAiChat("@cf/zai-org/glm-4.7-flash", { binding: env.AI });

chat({
  adapter,
  messages,
  modelOptions: {
    reasoning_effort: "low",
    chat_template_kwargs: { enable_thinking: false },
  },
});
```

Previously these fields were silently dropped, which could cause reasoning models (GLM-4.7-flash, Kimi K2.5/K2.6, GPT-OSS) to burn the entire output token budget on chain-of-thought with no visible content. They now reach `binding.run(model, inputs)` at the `inputs` level as required by Workers AI.

A new `WorkersAiTextModelOptions` type is exported from `@cloudflare/tanstack-ai` and `@cloudflare/tanstack-ai/adapters/workers-ai`.

Closes #503.
