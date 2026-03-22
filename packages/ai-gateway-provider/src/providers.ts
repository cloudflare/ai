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
	},
	{
		name: "google-ai-studio",
		regex: /^https:\/\/generativelanguage\.googleapis\.com\//,
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
		name: "google-vertex-ai",
		regex: /^https:\/\/(?:[a-z0-9]+-)*aiplatform\.googleapis\.com\//,
		transformEndpoint: (url: string) =>
			url.replace(/^https:\/\/(?:[a-z0-9]+-)*aiplatform\.googleapis\.com\//, ""),
	},
	{
		name: "azure-openai",
		regex: /^https:\/\/([^.]+)\.openai\.azure\.com\/openai\/deployments\/([^/]+)\/(.*)/,
		transformEndpoint: (url: string) => {
			const match = url.match(
				/^https:\/\/([^.]+)\.openai\.azure\.com\/openai\/deployments\/([^/]+)\/(.*)/,
			);
			if (!match) return url;
			return `${match[1]}/${match[2]}/${match[3]}`;
		},
	},
	{
		name: "openrouter",
		regex: /^https:\/\/openrouter\.ai\/api\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/openrouter\.ai\/api\//, ""),
	},
	{
		name: "aws-bedrock",
		regex: /^https:\/\/bedrock-runtime\.([^.]+)\.amazonaws\.com\//,
		transformEndpoint: (url: string) => {
			const match = url.match(
				/^https:\/\/bedrock-runtime\.([^.]+)\.amazonaws\.com\/(.*)/,
			);
			if (!match) return url;
			return `bedrock-runtime/${match[1]}/${match[2]}`;
		},
	},
	{
		name: "cerebras",
		regex: /^https:\/\/api\.cerebras\.ai\/v1\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.cerebras\.ai\/v1\//, ""),
	},
	{
		name: "cohere",
		regex: /^https:\/\/api\.cohere\.(com|ai)\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.cohere\.(com|ai)\//, ""),
	},
	{
		name: "deepgram",
		regex: /^https:\/\/api\.deepgram\.com\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.deepgram\.com\//, ""),
	},
	{
		name: "elevenlabs",
		regex: /^https:\/\/api\.elevenlabs\.io\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.elevenlabs\.io\//, ""),
	},
	{
		name: "fireworks",
		regex: /^https:\/\/api\.fireworks\.ai\/inference\/v1\//,
		transformEndpoint: (url: string) =>
			url.replace(/^https:\/\/api\.fireworks\.ai\/inference\/v1\//, ""),
	},
	{
		name: "huggingface",
		regex: /^https:\/\/api-inference\.huggingface\.co\/models\//,
		transformEndpoint: (url: string) =>
			url.replace(/^https:\/\/api-inference\.huggingface\.co\/models\//, ""),
	},
	{
		name: "cartesia",
		regex: /^https:\/\/api\.cartesia\.ai\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.cartesia\.ai\//, ""),
	},
	{
		name: "fal",
		regex: /^https:\/\/fal\.run\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/fal\.run\//, ""),
	},
	{
		name: "ideogram",
		regex: /^https:\/\/api\.ideogram\.ai\//,
		transformEndpoint: (url: string) => url.replace(/^https:\/\/api\.ideogram\.ai\//, ""),
	},
	{
		name: "compat",
		regex: /^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/compat\//,
		transformEndpoint: (url: string) =>
			url.replace(/^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/compat\//, ""),
	},
];
