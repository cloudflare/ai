# This file must exist as a hack to satisfy mcp.
# mcp has an optional dependency on uvicorn but still imports it at the top scope, see:
# https://github.com/modelcontextprotocol/python-sdk/blob/main/src/mcp/server/fastmcp/server.py#L18
# Because we never call `run_sse_async` this is not required. However, Python workers used asgi.py
# rather than uvicorn which is why this hack is needed. With this, the import succeeds.
