import { createElevenLabs as createElevenLabsOriginal } from '@ai-sdk/elevenlabs';
import { authWrapper } from '../auth';

export const createElevenLabs = (
  ...args: Parameters<typeof createElevenLabsOriginal>
) => authWrapper(createElevenLabsOriginal)(...args);
