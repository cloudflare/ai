---
"workers-ai-provider": patch
---

Forward `reasoning_effort` and `chat_template_kwargs` onto `binding.run(model, inputs)`'s `inputs` object instead of silently dropping them into the options arg / REST query string. This fixes reasoning models (GLM-4.7-flash, Kimi K2.5/K2.6, GPT-OSS, QwQ) burning the entire output token budget on chain-of-thought with no visible content.

Both settings-level and per-call usage are supported:

```ts
// Settings-level
const model = workersai("@cf/zai-org/glm-4.7-flash", {
  reasoning_effort: "low",
  chat_template_kwargs: { enable_thinking: false },
});

// Per-call (overrides settings)
await generateText({
  model,
  prompt,
  providerOptions: {
    "workers-ai": { reasoning_effort: "low" },
  },
});
```

`reasoning_effort: null` is preserved as-is (explicit "disable reasoning" signal). The two fields are also typed directly on `WorkersAIChatSettings`.

Closes #501.
