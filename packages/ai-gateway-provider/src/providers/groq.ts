import { createGroq as createGroqOriginal } from '@ai-sdk/groq';
import { authWrapper } from '../auth';

export const createGroq = (
  ...args: Parameters<typeof createGroqOriginal>
) => authWrapper(createGroqOriginal)(...args);
