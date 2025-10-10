import { createDeepSeek as createDeepSeekOriginal } from '@ai-sdk/deepseek';
import { authWrapper } from '../auth';

export const createDeepSeek = (
  ...args: Parameters<typeof createDeepSeekOriginal>
) => authWrapper(createDeepSeekOriginal)(...args);
