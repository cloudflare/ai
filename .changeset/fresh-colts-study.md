---
"workers-ai-provider": patch
---

Enhance response handling for number types.
This PR addresses a critical bug in the implementation that caused non-output when streaming responses from models like Llama4 that can return numeric chunks.
The issue stemmed from an inadequate check on incoming stream chunks, which assumed all chunks would have a .length property, leading to errors with non-string data types.
