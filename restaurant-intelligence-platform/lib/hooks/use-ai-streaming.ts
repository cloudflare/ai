import { useState, useCallback, useRef } from 'react';
import { processStreamResponse } from '@/lib/ai/openai-stream';
import { ConversationContext } from '@/lib/ai/openai-stream';

interface UseAIStreamingOptions {
  onError?: (error: Error) => void;
  onComplete?: (fullText: string) => void;
}

export function useAIStreaming(options: UseAIStreamingOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const streamMessage = useCallback(async (
    message: string,
    conversationId: string,
    context?: ConversationContext,
    onToken?: (token: string) => void,
    onComplete?: (fullText: string) => void
  ) => {
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setIsStreaming(true);
    setCurrentMessage('');

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          conversationId,
          context
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      processStreamResponse(
        response,
        (token) => {
          setCurrentMessage(prev => prev + token);
          onToken?.(token);
        },
        (fullText) => {
          setIsStreaming(false);
          setCurrentMessage('');
          onComplete?.(fullText);
          options.onComplete?.(fullText);
        },
        (error) => {
          setIsStreaming(false);
          setCurrentMessage('');
          options.onError?.(error);
        }
      );
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setIsStreaming(false);
        setCurrentMessage('');
        options.onError?.(error);
      }
    }
  }, [options]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setCurrentMessage('');
  }, []);

  return {
    streamMessage,
    stopStreaming,
    isStreaming,
    currentMessage
  };
}

export function useAICompletion() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const complete = useCallback(async (
    prompt: string,
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 1000
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.content;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    complete,
    isLoading,
    error
  };
}