# Model Context Protocol (MCP) Server + Delegated Clerk OAuth

WIP

Instead of acting as an OAuth client to Clerk and hosting our own OAuth provider inside the MCP / MCP auth service, we delegate OAuth completely to Clerk and utilize it as the OAuth provider.

Supports dynamic client registration on Clerk by only supporting the registration endpoint on our separate auth service hosted on the same worker. I say separate because I think it is confusing to say the MCP server itself manages the auth - I would say it is separate.

To be clear - the MCP server is a resource that simply checks against an access token, the Auth service provides the access token.

Code does not work without making changes to both the MCP TypeScript SDK and `mcp-remote` from Cloudflare.

Required secrets:
* `CLERK_BACKEND_URL`: Clerk Backend URL
* `CLERK_SECRET_KEY`: Clerk Instance Secret Key