# Todo API

A protected API providing basic Todo CRUD. Access is granted only with a PingFederate token.

### Stack

| Role | Name | Description |
| :--- | :--- | :--- |
| **Platform** | [Cloudflare Workers](https://workers.cloudflare.com) | Serverless execution |
| **Framework** | [Hono](https://hono.dev) | Lightweight API endpoints |
| **Data Storage** | [Cloudflare Workers KV](https://developers.cloudflare.com/kv) | User-scoped Todo list data |

### Requirements

* Node.js (v20+)
* PingFederate server
* Cloudflare account & [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update)

### Structure

```text
api/
├── src/
│   ├── index.ts           # Worker entry point, defines the routes
│   ├── config.ts          # Worker bindings, request-scoped variables, and scopes
│   ├── todoService.ts     # Todo CRUD with Cloudflare KV
│   └── auth.ts            # PingFederate token verification
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript compiler settings
└── wrangler.jsonc         # Worker configuration
```

## 🚀 Deploy to Cloudflare

1. Install dependencies and build
    ```zsh
    npm install
    npm run build
    ```

2. Set remote environment variables using wrangler

    | Name | Description | Example |
    | :--- | :--- | :--- |
    | API_ISSUER | PingFederate server domain | `https://<ENV>.com:9031` |
    | API_AUDIENCE | `aud` claim this API expects in JWTs | `https://todo-api-ping-federate.<ENV>.workers.dev` |

    ```bash
    wrangler secret put API_ISSUER
    wrangler secret put API_AUDIENCE
    ```

3. Configure remote KV storage using wrangler

    ```bash
    wrangler kv namespace create TODO_KV_PING_FEDERATE
    ```

    > Note: After running this command, you must update `wrangler.jsonc` with the generated KV namespace ID

4. Deploy

    ```bash
    npm run deploy
    ```
