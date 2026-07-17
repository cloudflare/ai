import { generateText } from "ai";
import { createAiGateway } from "ai-gateway-provider";
import { createDeepSeek } from "ai-gateway-provider/providers/deepseek";
import { Agent, routeAgentRequest } from "agents";

type Env = { REPRO_AGENT: DurableObjectNamespace<ReproAgent> };
type GatewayRequest = { query?: { messages?: Array<{ content?: string }> } };

const gatewayBodies: Array<Array<string | null>> = [];

const gateway = createAiGateway({
  binding: {
    async run(data: unknown) {
      const body = data as GatewayRequest[];
      const prompts = body.map((request) => request.query?.messages?.at(-1)?.content ?? null);
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
              message: { role: "assistant", content: `ANSWER:${String(prompt)}` },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { "content-type": "application/json", "cf-aig-step": "0" } },
      );
    },
  },
});

// Intentionally created once and shared by both concurrent generateText calls.
const deepseek = createDeepSeek();
const model = gateway(deepseek("deepseek-chat"));

export class ReproAgent extends Agent<Env> {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.endsWith("/run")) {
      return new Response("POST /agents/repro-agent/demo/run", { status: 404 });
    }

    gatewayBodies.length = 0;
    const ask = (prompt: string) =>
      generateText({ model, prompt, maxRetries: 0 }).then((result) => result.text);
    const [aResult, bResult] = await Promise.allSettled([ask("A"), ask("B")]);
    const a = aResult.status === "fulfilled" ? aResult.value : null;
    const b = bResult.status === "fulfilled" ? bResult.value : null;
    const errors = [aResult, bResult].map((result) =>
      result.status === "rejected"
        ? result.reason instanceof Error
          ? result.reason.stack ?? result.reason.message
          : String(result.reason)
        : null,
    );
    const reproduced =
      a !== "ANSWER:A" ||
      b !== "ANSWER:B" ||
      gatewayBodies.length !== 2 ||
      gatewayBodies[0]?.length !== 1 ||
      gatewayBodies[1]?.length !== 1;

    return Response.json({ a, b, errors, gatewayBodies, reproduced });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (await routeAgentRequest(request, env)) || new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
