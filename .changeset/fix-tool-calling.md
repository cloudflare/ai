---
"workers-ai-provider": patch
---

Fix three tool calling bugs that caused multi-turn agentic loops to fail

**1. Tool result output not unwrapped**

`convert-to-workersai-chat-messages.ts` was calling `JSON.stringify(toolResponse.output)` on the entire `LanguageModelV3ToolResultOutput` wrapper object (`{ type: 'text', value: '...' }`), sending the wrapper as the tool message content instead of just the value. Models received garbled tool results and stopped after the first tool call instead of continuing.

Fix: extract `output.value` and serialize only that.

**2. `toolChoice: "required"` mapped to `"any"` instead of `"required"`**

`utils.ts` mapped `toolChoice: "required"` to `tool_choice: "any"`. All vLLM-backed models (`@cf/moonshotai/kimi-k2.5`, `@cf/meta/llama-4-scout-17b-16e-instruct`, `@cf/zai-org/glm-4.7-flash`) return `8001: Invalid input` for `tool_choice: "any"`. The same incorrect mapping applied to `toolChoice: { type: "tool" }`.

Fix: map both to `"required"`.

**3. `description: false` in tool definitions**

`utils.ts` used `&&` short-circuit for tool description and parameters, which evaluates to `false` (not `undefined`) when `tool.type !== "function"`. Sending `description: false` to the binding causes `8001: Invalid input`.

Fix: use ternary to produce `undefined` when not applicable.

Tested against `@cf/moonshotai/kimi-k2.5`, `@cf/meta/llama-4-scout-17b-16e-instruct`, and `@cf/zai-org/glm-4.7-flash` via the Workers AI binding.
