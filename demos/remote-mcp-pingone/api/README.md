# Todo API

A protected API providing basic Todo CRUD. Access to this resource is granted only with a valid PingOne access token.

### Stack

| Role | Name | Description |
| :--- | :--- | :--- |
| **Platform** | [Cloudflare Workers](https://workers.cloudflare.com/) | Serverless execution |
| **Framework** | [Hono](https://hono.dev/) | Lightweight API endpoints |
| **Data Storage** | [Cloudflare Workers KV](https://developers.cloudflare.com/kv/) | User-scoped Todo list data |

### Requirements

* **Node.js (v20+)**
* **PingOne Environment**
* **Cloudflare Account & [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)**

### Structure

```text
api/
├── src/
│   ├── index.ts              # Worker entry point
│   ├── config.ts             # Worker bindings and request-scoped variables
│   ├── todoService.ts        # Todo CRUD with Cloudflare KV
│   └── auth.ts               # PingOne token verification
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript compiler settings
└── wrangler.jsonc            # Worker configuration
```

## 🏁 Getting Started

### PingOne Configuration

**Define the protected Todo API resource in the PingOne dashboard**
- **Name:** `Todo List API`
- **Audience:** `https://api.yourdomain.com`
- **Authentication Method:** `Client Secret Post`
- **Scopes:** `todo:manage`

![Todo API resource config in PingOne dashboard](../_docs/ping_api_resource_config.png)

### Environment Setup

```bash
cp .dev.vars.sample .dev.vars
```

| Name | Description | Example |
| :--- | :--- | :--- |
| PINGONE_ISSUER | PingOne environment domain | `https://auth.pingone.<REGION>/<ENV_ID>/as` |
| PINGONE_AUDIENCE | Audience of the API resource created in PingOne | `https://api.yourdomain.com` |

### Run Locally

```bash
npm install
npm run build
npm run dev
```

## 🚀 Deploy to Cloudflare

**1. Set remote environment variables**

```bash
wrangler secret put PINGONE_ISSUER
wrangler secret put PINGONE_AUDIENCE
```

> Note: When prompted to create a new worker during the first secret setup, submit "Y" to proceed and save the secret.

**2. Configure remote KV storage**

```bash
wrangler kv namespace create TODO_KV_NAMESPACE
```

> Note: After running this command, you must update `wrangler.jsonc` with the generated KV namespace ID.

**3. Deploy remote API**

```bash
npm run deploy
```
