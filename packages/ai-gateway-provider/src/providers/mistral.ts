import { createMistral as createMistralOriginal } from '@ai-sdk/mistral';
import { authWrapper } from '../auth';

export const createMistral = (
  ...args: Parameters<typeof createMistralOriginal>
) => authWrapper(createMistralOriginal)(...args);
