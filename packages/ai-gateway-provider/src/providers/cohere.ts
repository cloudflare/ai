import { createCohere as createCohereOriginal } from '@ai-sdk/cohere';
import { authWrapper } from '../auth';

export const createCohere = (
  ...args: Parameters<typeof createCohereOriginal>
) => authWrapper(createCohereOriginal)(...args);
