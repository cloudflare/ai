import { createAnthropic as createAnthropicOriginal } from '@ai-sdk/anthropic';
import { authWrapper } from '../auth';

export const createAnthropic = (
  ...args: Parameters<typeof createAnthropicOriginal>
) => authWrapper(createAnthropicOriginal)(...args);
