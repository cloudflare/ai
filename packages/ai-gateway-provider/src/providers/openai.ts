import { createOpenAI as createOpenAIOriginal } from '@ai-sdk/openai';
import { authWrapper } from '../auth';

export const createOpenAI = (
  ...args: Parameters<typeof createOpenAIOriginal>
) => authWrapper(createOpenAIOriginal)(...args);

