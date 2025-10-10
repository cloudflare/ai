import { createXai as createXaiOriginal } from '@ai-sdk/xai';
import { authWrapper } from '../auth';

export const createXai = (
  ...args: Parameters<typeof createXaiOriginal>
) => authWrapper(createXaiOriginal)(...args);
