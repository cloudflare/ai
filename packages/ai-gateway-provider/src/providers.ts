export const providers = [
	{
		regex: /^https:\/\/api\.openai\.com\//,
		name: "openai",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.openai\.com\//, ""),
	},
	{
		regex: /^https:\/\/api\.deepseek\.com\//,
		name: "deepseek",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.deepseek\.com\//, ""),
	},
	{
		regex: /^https:\/\/api\.anthropic\.com\//,
		name: "anthropic",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.anthropic\.com\//, ""),
	},
	{
		regex: /^https:\/\/generativelanguage\.googleapis\.com\//,
		name: "google-ai-studio",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/generativelanguage\.googleapis\.com\//, ""),
	},
	{
		regex: /^https:\/\/api\.x\.ai\//,
		name: "grok",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.x\.ai\//, ""),
	},
	{
		regex: /^https:\/\/api\.mistral\.ai\//,
		name: "mistral",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.mistral\.ai\//, ""),
	},
	{
		regex: /^https:\/\/api\.perplexity\.ai\//,
		name: "perplexity-ai",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.perplexity\.ai\//, ""),
	},
	{
		regex: /^https:\/\/api\.replicate\.com\//,
		name: "replicate",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.replicate\.com\//, ""),
	},
	{
		regex: /^https:\/\/api\.groq\.com\/openai\/v1\//,
		name: "groq",
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.groq\.com\/openai\/v1\//, ""),
	},
	{
		regex: /^https:\/\/(?<resource>[^.]+)\.openai\.azure\.com\/openai\/deployments\/(?<deployment>[^/]+)\/(?<rest>.*)$/,
		name: "azure-openai",
		transformEndpoint: (url: string) => {
			const match = url.match(/^https:\/\/(?<resource>[^.]+)\.openai\.azure\.com\/openai\/deployments\/(?<deployment>[^/]+)\/(?<rest>.*)$/);
			if (!match || !match.groups) return url;
			const { resource, deployment, rest } = match.groups;
			if (!resource || !deployment || !rest) {
				throw new Error("Failed to parse Azure OpenAI endpoint URL.");
			}
			return `${resource}/${deployment}/${rest}`;
		},
	},
];
