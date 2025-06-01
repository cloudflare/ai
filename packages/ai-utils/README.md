## Developer toolkit that makes it simple to build with the Workers AI platform.

Includes support for embedded function calling, and more in the future!

### Installation

```bash
npm install @cloudflare/ai-utils --save
```

### What is this?

This package contains a set of utilities to make it easier to work with the [Cloudflare Workers AI platform](https://developers.cloudflare.com/workers-ai/).

To learn more about function calling and its usage on Cloudflare, refer to the documentation here: [Cloudflare Function Calling Documentation](https://developers.cloudflare.com/workers-ai/function-calling/).

This package contains the following utilities:

### `runWithTools`

`runWithTools` is a helper function that helps you do function calling with a simpler syntax with `AI.run()`. You can provide a function inline with the tool you want to use, which is run automatically with the arguments passed to the function in the same worker where the AI call is invoked.

**Features of runWithTools**:

- ⚡ Multi-tool calls feature
- 🔁 Recursive tool calls
- 👟 Handles function runs with errors
- Streaming final response
- The returntype is the same as AI.run
- Programmatically trim tools, or use `autoTrimTools` to automatically do it.

It also supports the following configuration options:

- `strictValidation` - If set to `true`, the function will throw an error if the tool's arguments by LLM are not valid. Defaults to `false`.
- `maxRecursiveToolRuns` - The maximum number of times the tool can be run recursively. Defaults to `1`.
- `streamFinalResponse` - If set to `true`, the function will return a `ReadableStream` instead of a string. Defaults to `false`.
- `verbose` - If set to `true`, the function will print out more information about the tool's execution. Defaults to `false`.
- `trimFunction` - This is a function that can be used to trim the tools. It takes all the arguments (tools, AI, model, messages) and can return the trimmed array of tools. You can use this to decide which tools to use with a small model before sending the function call query (which usually uses a lot of tokens!)

We also provide a function `autoTrimTools`, which takes a tool array and trims it based on the names and the descriptions of each of them.

Usage:

```ts
const r = await runWithTools(
  env.AI,
  "@hf/nousresearch/hermes-2-pro-mistral-7b",
  {
    messages: [
      { role: "user", content: "What's the weather in Mumbai, India?" },
    ],
    tools: [
      {
        name: "get-weather",
        description: "Gets weather information of a particular city",
        parameters: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "The city name",
            },
          },
          required: ["city"],
        },
        function: async ({ city }) => {
          // fetch weather data from an API
          console.log("value from llm", city);

          return city;
        },
      },
    ],
  },
  {
    strictValidation: true,
    maxRecursiveToolRuns: 1,
    streamFinalResponse: true,
    // If there's too many tools, you can enable this
    trimFunction: autoTrimTools,
  },
);
```

You may also use the `tool()` function, which is a helper that provides type completions for the function arguments and the tool, so you can create tools from outside the `runWithTools` function and still enjoy type safety.

```ts
import { tool } from "@cloudflare/ai-utils"

const ourTool = tool({
	name: "ourTool"
	...
	function: async (args) => {...}
})
```

### OpenAPI to Tool Converter

This project provides a function `createToolsFromOpenAPISpec` that converts an OpenAPI specification into a set of tools in JSONSchema format, each with an associated function to make API calls. This can be useful for generating API clients dynamically based on an OpenAPI spec.
Using this, users can simply make agents like:

- Google calendar agent
- Github repository manager / issue tracker
- Email -> Airtable database inserter

As long as the API provides an OpenAPI spec, an agent can be made with it. When paired with runWithTools, this provides an amazing developer experience where smart workloads can be performed with just a few lines of code.

**Usage**

This function takes an OpenAPI spec and a configuration object and returns an array of tools.

Arguments:

- `spec`: The OpenAPI specification. This can be in JSON or YAML form. You can also provide a remote specification and it will be fetched and parsed.
- `config`:
  - `matchPatterns`: An array of regex patterns to match, helpful if you don't want the entire API but a small part of it.
  - `overrides` []:
    - `matcher`: A matcher function that takes the URL and method and returns a boolean.
    - `values`: If the matcher was true, these values will be added as an override when making the actual fetch request. This can be helpful for adding User agents, authentication tokens and more. You can provide `headers`, `pathData`, `query`, `formData`, `body` and `cookies` as values.

```typescript
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
      matcher: ({ url, method }) => {
        return url.hostname === "api.github.com";
      },
      values: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
          Authorization: "Bearer GITHUB_TOKEN",
        },
      },
    },
  ],
});
```

### Embedded function calling on the Workers platform

When used with the [Cloudflare Workers](https://workers.cloudflare.com) platform, you can also use [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/) to make database queries and lookups, store and get images, spin up browser instances or even run AI models as a function of your tool.

Because we use bindings, most of the compute and the lookups happen in the same execution environment, which helps decrease the latency and get a 10-20% faster response time.

Here's an example of an agent that automatically makes database entries with conversations to have a 'memory' of who the user is:

```ts
const r = await runWithTools(
  env.AI,
  "@hf/nousresearch/hermes-2-pro-mistral-7b",
  {
    messages: [
      {
        role: "system",
        content: "Save important information about the user to the KV databse.",
      },
      {
        role: "user",
        content: "Hi! I'm dhravya. An engineering intern at Cloudflare.",
      },
    ],
    tools: [
      tool({
        name: "Save information",
        description: "Info save about the user",
        parameters: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "Name of the user",
            },
            value: {
              type: "string",
              description: "Information of the user",
            },
          },
          required: ["key", "value"],
        },
        function: async ({ key, value }) => {
          await env.KV.put(key, value);
          return `Saved ${key} to the KV database.`;
        },
      }),
    ],
  },
);
```

### Contributing

This project is open source and welcomes contributions. If you'd like to contribute, please fork the repository and submit a pull request.

### License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
