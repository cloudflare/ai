export const providers = [
	{
		name: "openai",
		regex: /^https:\/\/api\.openai\.com\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.openai\.com\//, ""),
	},
	{
		name: "deepseek",
		regex: /^https:\/\/api\.deepseek\.com\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.deepseek\.com\//, ""),
	},
	{
		name: "anthropic",
		regex: /^https:\/\/api\.anthropic\.com\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.anthropic\.com\//, ""),
		headerKey: "x-api-key",
	},
	{
		name: "google-ai-studio",
		regex: /^https:\/\/generativelanguage\.googleapis\.com\//,
		headerKey: "x-goog-api-key",
		transformEndpoint: (url: string) =>
			url.replace(/^https:\/\/generativelanguage\.googleapis\.com\//, ""),
	},
	{
		name: "grok",
		regex: /^https:\/\/api\.x\.ai\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.x\.ai\//, ""),
	},
	{
		name: "mistral",
		regex: /^https:\/\/api\.mistral\.ai\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.mistral\.ai\//, ""),
	},
	{
		name: "perplexity-ai",
		regex: /^https:\/\/api\.perplexity\.ai\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.perplexity\.ai\//, ""),
	},
	{
		name: "replicate",
		regex: /^https:\/\/api\.replicate\.com\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.replicate\.com\//, ""),
	},
	{
		name: "groq",
		regex: /^https:\/\/api\.groq\.com\/openai\/v1\//,
		transformEndpoint: (url: string) =>
			url.replace(/^https:\/\/api\.groq\.com\/openai\/v1\//, ""),
	},
	{
		name: "azure-openai",
		regex: /^https:\/\/(?<resource>[^.]+)\.openai\.azure\.com\/openai\/deployments\/(?<deployment>[^/]+)\/(?<rest>.*)$/,
		transformEndpoint: (url: string) => {
			const match = url.match(
				/^https:\/\/(?<resource>[^.]+)\.openai\.azure\.com\/openai\/deployments\/(?<deployment>[^/]+)\/(?<rest>.*)$/,
			);
			if (!match || !match.groups) return url;
			const { resource, deployment, rest } = match.groups;
			if (!resource || !deployment || !rest) {
				throw new Error("Failed to parse Azure OpenAI endpoint URL.");
			}
			return `${resource}/${deployment}/${rest}`;
		},
		headerKey: "api-key",
	},
];
