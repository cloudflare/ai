import { createFireworks as createFireworksOriginal } from '@ai-sdk/fireworks';
import { authWrapper } from '../auth';

export const createFireworks = (
  ...args: Parameters<typeof createFireworksOriginal>
) => authWrapper(createFireworksOriginal)(...args);
