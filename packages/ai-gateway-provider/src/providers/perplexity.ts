import { createPerplexity as createPerplexityOriginal } from '@ai-sdk/perplexity';
import { authWrapper } from '../auth';

export const createPerplexity = (
  ...args: Parameters<typeof createPerplexityOriginal>
) => authWrapper(createPerplexityOriginal)(...args);
