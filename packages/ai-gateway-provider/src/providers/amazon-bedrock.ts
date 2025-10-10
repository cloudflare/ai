import { createAmazonBedrock as createAmazonBedrockOriginal } from '@ai-sdk/amazon-bedrock';
import { authWrapper } from '../auth';

export const createAmazonBedrock = (
  ...args: Parameters<typeof createAmazonBedrockOriginal>
) => authWrapper(createAmazonBedrockOriginal)(...args);