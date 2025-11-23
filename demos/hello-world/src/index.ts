import { Agent, type AgentNamespace, routeAgentRequest } from "agents";

type Env = {
	HelloAgent: AgentNamespace<HelloAgent>;
};

export class HelloAgent extends Agent<Env, never> {
	async onRequest(_request: Request): Promise<Response> {
		return new Response("Hello, Agent!", { status: 200 });
	}
}

export default {
	async fetch(request: Request, env: Env) {
		return (
			(await routeAgentRequest(request, env, { cors: true })) ||
			new Response("Not found", { status: 404 })
		);
	},
};
