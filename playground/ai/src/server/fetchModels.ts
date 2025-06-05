import { env } from "cloudflare:workers";

// TODO: We should fetch this dynamically when available via the API
const loraMappings = {
	"@cf/google/gemma-7b-it-lora": ["@cf/google/gemma-7b-it"],
	"@cf/mistral/mistral-7b-instruct-v0.2-lora": [
		"@hf/mistral/mistral-7b-instruct-v0.2",
		"@cf/mistral/mistral-7b-instruct-v0.1-vllm",
		"@cf/mistral/mistral-7b-instruct-v0.1",
	],
};

type Result<T> = {
	success: boolean;
	result: T[];
	errors: string[];
};

export type Model = {
	id: string;
	source: number;
	name: keyof AiModels;
	description: string;
	task: {
		id: string;
		name: string;
		description: string;
	};
	created_at: string;
	tags: string[];
	properties: {
		property_id: string;
		value: string;
	}[];
	finetunes?: FineTune[];
};

type FineTune = {
	id: string;
	name: string;
	description: string;
	created_at: string;
	modified_at: string;
	public: number;
	model: keyof AiModels;
};

const cacheTTL = 60 * 5;

export default async function fetchModels(): Promise<Response> {
	const reqParams = {
		headers: {
			Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
		},
	};

	// This is a fake request to use as the Cache key for storage/retrieval.
	// The URL string means nothing, just needs to be valid.
	const fakeRequest = new Request(
		new URL("https://playground.ai.cloudflare.com/api/models"),
	);
	// @ts-expect-error - default is not a property of web standard CacheStorage
	const cache = caches.default as Cache;
	let response = await cache.match(fakeRequest);

	if (!response) {
		// Handle Cache miss
		const modelsEndpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search`;
		const finetunesEndpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/finetunes/public`;

		const data = await Promise.all([
			fetch(modelsEndpoint, reqParams).then((res) => res.json<Result<Model>>()),
			fetch(finetunesEndpoint, reqParams).then((res) =>
				res.json<Result<FineTune>>(),
			),
		]);

		const models = data[0].result
			// TODO: We can remove this once the `?task=Text%20Generation` API filter works
			.filter((model) => model.task.name === "Text Generation")
			// We want to hide our '-lora' models and prefer aliases
			.filter((model) => !model.name.includes("-lora"))
			// Order alphabetically by model
			.sort((a, b) => (a.name.split("/")[2] < b.name.split("/")[2] ? -1 : 1));

		const finetunes = data[1].result;

		// Inline finetunes into respective model objects
		for (const finetune of finetunes) {
			const mappings =
				loraMappings[finetune.model as keyof typeof loraMappings];

			if (mappings && Array.isArray(mappings)) {
				for (const modelName of mappings) {
					const rootModel = models.find((model) => model.name === modelName);

					if (rootModel) {
						rootModel.finetunes = rootModel.finetunes
							? [...rootModel.finetunes, finetune]
							: [finetune];
					}
				}
			}
		}

		response = Response.json({ models });

		// Cache response for 5 mins
		response.headers.append("Cache-Control", `s-maxage=${cacheTTL}`);

		cache.put(fakeRequest, response.clone());
	}

	return response;
}
