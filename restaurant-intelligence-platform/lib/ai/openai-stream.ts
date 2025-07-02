import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  temperature?: number;
  max_tokens?: number;
  model?: string;
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
}

export async function createOpenAIStream(
  messages: ChatMessage[],
  options: StreamOptions = {}
) {
  const {
    temperature = 0.7,
    max_tokens = 2000,
    model = 'gpt-4-turbo-preview',
    onToken,
    onComplete,
  } = options;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      stream: true,
    });

    let fullText = '';

    // Convert the response into a friendly text-stream
    const stream = OpenAIStream(response, {
      onToken(token) {
        fullText += token;
        onToken?.(token);
      },
      onFinal() {
        onComplete?.(fullText);
      },
    });

    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error('OpenAI streaming error:', error);
    throw error;
  }
}

export async function streamCompletion(
  prompt: string,
  systemPrompt?: string,
  options: StreamOptions = {}
) {
  const messages: ChatMessage[] = [];
  
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  
  messages.push({ role: 'user', content: prompt });
  
  return createOpenAIStream(messages, options);
}

export function processStreamResponse(
  response: Response,
  onToken: (token: string) => void,
  onComplete: (fullText: string) => void,
  onError?: (error: Error) => void
) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  if (!reader) {
    onError?.(new Error('No reader available'));
    return;
  }

  const readStream = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          onComplete(fullText);
          break;
        }

        const chunk = decoder.decode(value);
        fullText += chunk;
        onToken(chunk);
      }
    } catch (error) {
      onError?.(error as Error);
    }
  };

  readStream();
}

export interface ConversationContext {
  restaurantId?: string;
  locationId?: string;
  dateRange?: { start: Date; end: Date };
  fileContext?: Array<{
    filename: string;
    content: string;
    type: string;
  }>;
  previousMessages?: ChatMessage[];
}

export function buildContextualPrompt(
  userMessage: string,
  context: ConversationContext
): string {
  let prompt = userMessage;

  if (context.restaurantId) {
    prompt = `[Context: Restaurant ID ${context.restaurantId}] ${prompt}`;
  }

  if (context.locationId) {
    prompt = `[Context: Location ID ${context.locationId}] ${prompt}`;
  }

  if (context.dateRange) {
    prompt = `[Context: Date range ${context.dateRange.start.toISOString()} to ${context.dateRange.end.toISOString()}] ${prompt}`;
  }

  if (context.fileContext && context.fileContext.length > 0) {
    const fileInfo = context.fileContext
      .map(f => `File: ${f.filename} (${f.type})`)
      .join(', ');
    prompt = `[Context: Files - ${fileInfo}] ${prompt}`;
  }

  return prompt;
}

export const SYSTEM_PROMPTS = {
  restaurantAnalyst: `You are an AI restaurant analyst specializing in operational insights, performance metrics, and strategic recommendations. You have access to comprehensive restaurant data including sales, inventory, staffing, and customer feedback. Provide data-driven insights and actionable recommendations.`,
  
  marketingAssistant: `You are an AI marketing assistant for restaurants. You help create compelling marketing content, analyze campaign performance, and suggest promotional strategies. You understand restaurant industry trends, seasonal patterns, and customer preferences.`,
  
  knowledgeExtractor: `You are an AI knowledge extraction specialist. You analyze conversations and data to identify key insights, patterns, and actionable information that should be stored in the knowledge graph for future reference.`,
  
  dataAnalyst: `You are an AI data analyst with expertise in restaurant metrics, KPIs, and performance analysis. You can interpret complex data patterns, identify trends, and provide statistical insights.`,
};