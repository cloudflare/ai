import { createGoogleGenerativeAI as createGoogleGenerativeAIOriginal } from '@ai-sdk/google';
import { authWrapper } from '../auth';

export const createGoogleGenerativeAI = (
  ...args: Parameters<typeof createGoogleGenerativeAIOriginal>
) => authWrapper(createGoogleGenerativeAIOriginal)(...args);
