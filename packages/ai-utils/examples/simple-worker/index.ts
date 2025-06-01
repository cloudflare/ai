import { createToolsFromOpenAPISpec, runWithTools, tool, autoTrimTools } from "../../src";

const GITHUB_SPEC =
	"https://raw.githubusercontent.com/github/rest-api-description/main/descriptions-next/api.github.com/api.github.com.json";

export default {
	async fetch(request, env, _ctx): Promise<Response> {
		const prompt = new URL(request.url).searchParams.get("prompt");
		if (!prompt) {
			return new Response("No prompt provided. Try '?prompt=Who is github user joe?'", {
				status: 400,
			});
		}

		const githubUserTool = await createToolsFromOpenAPISpec(GITHUB_SPEC, {
			matchPatterns: [
				// api.github.com/users/{username} and api.github.com/users/{username}/repos
				/^https:\/\/api\.github\.com\/users\/([^\/]+)\/repos$/,
				/^https:\/\/api\.github\.com\/users\/([^\/]+)$/,
				// Also, for api.github.com/repos/{owner}/{repo}/ queries
				/^https:\/\/api\.github\.com\/repos\/([^\/]+)\/([^\/]+)\/?$/,
			],
			overrides: [
				{
					// for all requests on *.github.com, we'll need to add a User-Agent and Authorization.
					matcher: ({ url }: { url: URL; method: string }) => {
						return url.hostname === "api.github.com";
					},
					values: {
						headers: {
							"User-Agent":
								"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
						},
					},
				},
			],
		});

		const start_Time = Date.now();
		const response = await runWithTools(
			env.AI,
			"@hf/nousresearch/hermes-2-pro-mistral-7b",
			{
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
				tools: [
					// You can pass the OpenAPI spec link or contents directly
					...(await createToolsFromOpenAPISpec(
						"https://raw.githubusercontent.com/OAI/OpenAPI-Specification/master/examples/v3.0/petstore.json",
					)),

					// Or use a pre-generated openapi spec
					...githubUserTool,

					tool({
						name: "hello world",
						description: "This is a test tool",
						parameters: {
							type: "object",
							properties: {
								hi: {
									type: "string",
									description: "Hello world",
								},
							},
							required: ["hi"],
						},

						// Optionally provide a function to automatically execute the tool
						function: async ({ hi }: { hi: string }) => {
							const answer = await fetch(`https://example.com/?hi=${hi}`);
							console.log(answer);

							// You can also use bindings inside the functions! Here's an example of using the D1 database binding.
							// env.MY_DB.prepare("INSERT INTO mytable (name, age) VALUES (hi, 3)").run()

							return answer.text();
						},
					}),
				],
			},
			{
				// strictValidation: true,
				streamFinalResponse: false,
				verbose: true,
				trimFunction: autoTrimTools,

				// You can also pass in a function to programmatically choose the best tools for your task.

				// trimFunction: async (tools, ai, model, messages) => {
				//    const newtools = tools.filter((tool) => tool.name !== "chooseTool")
				//   return newtools
				// },
			},
		).then((response: any) => {
			const end_Time = Date.now();
			const seconds = (end_Time - start_Time) / 1000;
			console.log(`Time taken: ${seconds} seconds`);
			return response;
		});

		return new Response(
			response instanceof ReadableStream ? response : JSON.stringify(response, null, 2),
		);
	},
} satisfies ExportedHandler<Env>;
