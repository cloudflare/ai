---
"workers-ai-provider": patch
---

Fix reasoning content being concatenated into assistant message content in multi-turn conversations

Previously, reasoning parts in assistant messages were concatenated into the `content` string when building message history. This caused models like `kimi-k2.5` and `deepseek-r1` to receive their own internal reasoning as if it were spoken text, corrupting the conversation history and resulting in empty text responses or leaked special tokens on subsequent turns.

Reasoning parts are now sent as the `reasoning` field on the assistant message object, which is the field name vLLM expects on input for reasoning models (kimi-k2.5, glm-4.7-flash).
