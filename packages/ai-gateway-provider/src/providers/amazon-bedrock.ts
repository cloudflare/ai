import { createAmazonBedrock as createAmazonBedrockOriginal } from "@ai-sdk/amazon-bedrock";
import { CF_TEMP_TOKEN } from "../auth";

export const createAmazonBedrock = (...args: Parameters<typeof createAmazonBedrockOriginal>) => {
	let [config] = args;
	if (config === undefined) {
		config = { region: "us-east-1", accessKeyId: CF_TEMP_TOKEN, secretAccessKey: CF_TEMP_TOKEN };
	} else {
		if (config.region === undefined) {
			config.region = "us-east-1";
		}
		if (config.accessKeyId === undefined) {
			config.accessKeyId = CF_TEMP_TOKEN;
		}
		if (config.secretAccessKey === undefined) {
			config.secretAccessKey = CF_TEMP_TOKEN;
		}
	}
	return createAmazonBedrockOriginal(config);
};
