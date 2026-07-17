# Reproduction for cloudflare/ai#620

This project pins `ai-gateway-provider@3.2.0` and `ai@6.0.208` and demonstrates that two concurrent `generateText` calls sharing one wrapped model can capture and receive each other's request/response data.

## Exact Node reproduction

```bash
npm install
npm run repro:node
```

Observed:

```json
{
  "a": "ANSWER:undefined",
  "b": "ANSWER:A",
  "gatewayBodies": [[], ["A", "B"]]
}
```

Expected:

```json
{
  "a": "ANSWER:A",
  "b": "ANSWER:B",
  "gatewayBodies": [["A"], ["B"]]
}
```

## Browser reproduction

```bash
npm install
npm run deploy
```

Open the deployed URL and press **Trigger bug**. The Worker uses the same package versions and a local fake AI Gateway binding, so it requires no provider or Cloudflare AI credentials.
