# Model Context Protocol (MCP) Server + WorkOS AuthKit

This is an example [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server that allows remote clients to connect and authenticate using [WorkOS](https://workos.com) [AuthKit](https://authkit.com).

AuthKit supports user management features including an organization-centric
authentication model allowing you to control tool access based on user and
organization permissions.

## Getting Started

First to create a WorkOS account by signing into the [WorkOS Dashboard](https://dashboard.workos.com).

Next, add the MCP server's callback URL as a Redirect URI under **_Redirects_**
-> **_Sign in callback_**. If you are testing locally, this will be
`http://localhost:8788/callback`, or if deployed, the domain of your deployed
worker with the same `/callback` path.

Next, you must set the `WORKOS_CLIENT_ID` and `WORKOS_CLIENT_SECRET` environment
variables. These can be obtained from the WorkOS Dashboard under **_API Keys_**.

You can set these in the Cloudflare dashboard or using the `wrangler`
CLI:

```sh
$ npx wrangler secret put WORKOS_CLIENT_ID <your_workos_client_id>
$ npx wrangler secret put WORKOS_CLIENT_SECRET <your_workos_client_secret>
```

**Note:** The `WORKOS_CLIENT_ID` isn't technically a secret and so you may also choose
to set it via your `wrangler.jsonc` configuration file. But `WORKOS_CLIENT_SECRET` is not
public and should be securely set elsewhere.

And that's it! You can now test out your remote MCP server using the example
playground below.

## Testing MCP Authentication

Visit the [Cloudflare Workers AI playground](https://playground.ai.cloudflare.com) and enter the URL of your worker:

```
# Local
http://localhost:8788/sse

# Deployed
https://<your-worker-domain>/sse
```

After clicking **_Connect_**, you'll be redirected to your WorkOS AuthKit
domain, where you can sign-in, and be returned to the playground authenticated
as a WorkOS AuthKit user.

In the demo code, the `generateImage` tool is gated behind the `image_generation` permission. You can [read more about Permissions in AuthKit here](https://workos.com/docs/user-management/roles-and-permissions). Try assigning a permission with the `image_generation` slug to your user to see how it enables additional tools in the playground.
