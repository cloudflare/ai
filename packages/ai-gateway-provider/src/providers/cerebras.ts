import { createCerebras as createCerebrasOriginal } from '@ai-sdk/cerebras';
import { authWrapper } from '../auth';

export const createCerebras = (
  ...args: Parameters<typeof createCerebrasOriginal>
) => authWrapper(createCerebrasOriginal)(...args);
