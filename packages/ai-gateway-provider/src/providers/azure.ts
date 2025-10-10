import { createAzure as createAzureOriginal } from '@ai-sdk/azure';
import { authWrapper } from '../auth';

export const createAzure = (
  ...args: Parameters<typeof createAzureOriginal>
) => authWrapper(createAzureOriginal)(...args);