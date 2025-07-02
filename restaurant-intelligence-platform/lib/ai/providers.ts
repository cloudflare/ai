import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Provider configurations for Vercel AI SDK
export const providers = {
  openai: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: 'strict',
  }),
  
  anthropic: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  }),
  
  google: createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
  }),
};

// Model presets for different use cases
export const models = {
  // Fast responses for real-time interactions
  fast: {
    openai: providers.openai('gpt-4o-mini'),
    anthropic: providers.anthropic('claude-3-haiku-20240307'),
    google: providers.google('gemini-1.5-flash'),
  },
  
  // Balanced performance and quality
  standard: {
    openai: providers.openai('gpt-4o'),
    anthropic: providers.anthropic('claude-3-5-sonnet-20241022'),
    google: providers.google('gemini-1.5-pro'),
  },
  
  // Best quality for complex analysis
  advanced: {
    openai: providers.openai('gpt-4-turbo'),
    anthropic: providers.anthropic('claude-3-opus-20240229'),
    google: providers.google('gemini-1.5-pro'),
  },
};

// Provider selection based on capabilities
export function selectProvider(task: 'chat' | 'analysis' | 'extraction' | 'generation') {
  const providerMap = {
    chat: models.fast.openai,
    analysis: models.standard.openai,
    extraction: models.standard.anthropic,
    generation: models.standard.openai,
  };
  
  return providerMap[task] || models.standard.openai;
}

// Multi-provider fallback mechanism
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallbacks: Array<() => Promise<T>>
): Promise<T> {
  try {
    return await primary();
  } catch (primaryError) {
    console.error('Primary provider failed:', primaryError);
    
    for (const fallback of fallbacks) {
      try {
        return await fallback();
      } catch (fallbackError) {
        console.error('Fallback provider failed:', fallbackError);
      }
    }
    
    throw new Error('All providers failed');
  }
}