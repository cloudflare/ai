import { createDeepgram as createDeepgramOriginal } from '@ai-sdk/deepgram';
import { authWrapper } from '../auth';

export const createDeepgram = (
  ...args: Parameters<typeof createDeepgramOriginal>
) => authWrapper(createDeepgramOriginal)(...args);
