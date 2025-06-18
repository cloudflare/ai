import type { Model, FineTune } from "../src/models";
import * as fs from "node:fs";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
	throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set");
}

type Result<T> = {
	success: boolean;
	result: T[];
	errors: string[];
};

// TODO: We should fetch this dynamically when available via the API
const loraMappings = {
	"@cf/google/gemma-7b-it-lora": ["@cf/google/gemma-7b-it"],
	"@cf/mistral/mistral-7b-instruct-v0.2-lora": [
		"@hf/mistral/mistral-7b-instruct-v0.2",
		"@cf/mistral/mistral-7b-instruct-v0.1-vllm",
		"@cf/mistral/mistral-7b-instruct-v0.1",
	],
};

async function main() {
	const reqParams = {
		headers: {
			Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
		},
	};
	const modelsEndpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search`;
	const finetunesEndpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/finetunes/public`;

	const data = await Promise.all([
		fetch(modelsEndpoint, reqParams).then((res) => res.json<Result<Model>>()),
		fetch(finetunesEndpoint, reqParams).then((res) => res.json<Result<FineTune>>()),
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
		const mappings = loraMappings[finetune.model as keyof typeof loraMappings];

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

	fs.writeFileSync("../src/models.json", JSON.stringify(models));
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
