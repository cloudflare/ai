import { generateText } from "ai";
import { createAiGateway } from "ai-gateway-provider";
import { createDeepSeek } from "ai-gateway-provider/providers/deepseek";

const gateway = createAiGateway({
  accountId: "test",
  gateway: "test",
  apiKey: "test",
});

const deepseek = createDeepSeek();
const model = gateway(deepseek("deepseek-chat"));
const gatewayBodies = [];

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  const prompts = body.map((request) => request.query?.messages?.at(-1)?.content);
  gatewayBodies.push(prompts);

  const prompt = prompts[0];
  return new Response(
    JSON.stringify({
      id: "id",
      object: "chat.completion",
      created: 0,
      model: "deepseek-chat",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: `ANSWER:${prompt}` },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { headers: { "content-type": "application/json", "cf-aig-step": "0" } },
  );
};

const ask = (prompt) => generateText({ model, prompt, maxRetries: 0 }).then((result) => result.text);
const [a, b] = await Promise.all([ask("A"), ask("B")]);

console.log(JSON.stringify({ a, b, gatewayBodies }, null, 2));
