type ProviderConfig = {
	name: string;
	regex: RegExp;
	transformEndpoint: (url: string) => string;
	headerKey?: string;
	extraStripHeaders?: string[];
};

export const providers: ProviderConfig[] = [
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
		name: "google-vertex-ai",
		regex: /aiplatform\.googleapis\.com/,
		transformEndpoint: (url: string) =>
			url.replace(/https:\/\/(.*)[-]?aiplatform\.googleapis\.com\//, ""),
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
		name: "google-vertex-ai",
		regex: /^https:\/\/(?:[a-z0-9]+-)*aiplatform\.googleapis\.com\//,
		transformEndpoint: (url: string) =>
			url.replace(/^https:\/\/(?:[a-z0-9]+-)*aiplatform\.googleapis\.com\//, ""),
		headerKey: "authorization",
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
	{
		name: "openrouter",
		regex: /^https:\/\/openrouter\.ai\/api\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/openrouter\.ai\/api\//, ""),
	},
	{
		name: "aws-bedrock",
		regex: /^https:\/\/bedrock-runtime\.([a-z0-9-]+)\.amazonaws\.com\//,
		transformEndpoint: (url: string) => {
			const match = url.match(
				/^https:\/\/bedrock-runtime\.([a-z0-9-]+)\.amazonaws\.com\/(.*)/,
			);
			if (!match || !match[1] || !match[2]) {
				throw new Error("Failed to parse AWS Bedrock endpoint URL.");
			}
			return `bedrock-runtime/${match[1]}/${match[2]}`;
		},
		extraStripHeaders: ["x-amz-date", "x-amz-security-token", "x-amz-content-sha256"],
	},
	{
		name: "compat",
		regex: /^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/compat\//,
		transformEndpoint: (url: string) =>
			url.replace(/^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/compat\//, ""),
	},
];
