import { createOpenAIStream, ChatMessage, StreamOptions, SYSTEM_PROMPTS, ConversationContext, buildContextualPrompt } from './openai-stream';
import { Neo4jService } from '../services/neo4j-service';
import { extractKnowledge } from './knowledge-extractor';

export interface AIServiceConfig {
  neo4jService?: Neo4jService;
  defaultModel?: string;
  defaultTemperature?: number;
}

export interface AIResponse {
  message: string;
  suggestions?: string[];
  insights?: any[];
  metadata?: Record<string, any>;
}

export interface ConversationMessage extends ChatMessage {
  id: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class AIService {
  private neo4jService?: Neo4jService;
  private config: AIServiceConfig;
  private conversations: Map<string, ConversationMessage[]> = new Map();

  constructor(config: AIServiceConfig = {}) {
    this.config = config;
    this.neo4jService = config.neo4jService;
  }

  async streamChat(
    message: string,
    conversationId: string,
    context?: ConversationContext,
    options?: StreamOptions
  ) {
    // Get conversation history
    const history = this.getConversationHistory(conversationId);
    
    // Build contextual prompt
    const contextualMessage = buildContextualPrompt(message, context || {});
    
    // Prepare messages with history
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.restaurantAnalyst },
      ...history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: contextualMessage }
    ];

    // Store user message
    this.addToConversation(conversationId, {
      role: 'user',
      content: message,
      metadata: context
    });

    // Create streaming response
    const stream = await createOpenAIStream(messages, {
      ...options,
      onComplete: async (fullText) => {
        // Store assistant response
        this.addToConversation(conversationId, {
          role: 'assistant',
          content: fullText,
        });

        // Extract knowledge if Neo4j is available
        if (this.neo4jService) {
          await this.persistKnowledge(conversationId, message, fullText, context);
        }

        options?.onComplete?.(fullText);
      }
    });

    return stream;
  }

  async generateSuggestions(
    context: string,
    field: string,
    existingValue?: string
  ): Promise<string[]> {
    const prompt = `Given the context: "${context}" and field: "${field}"${existingValue ? ` with current value: "${existingValue}"` : ''}, suggest 3-5 relevant options or improvements. Return only the suggestions as a JSON array of strings.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an AI assistant helping with form field suggestions for restaurant management.' },
      { role: 'user', content: prompt }
    ];

    try {
      const response = await fetch('/api/chat/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, temperature: 0.5, max_tokens: 200 })
      });

      const data = await response.json();
      return JSON.parse(data.content);
    } catch (error) {
      console.error('Error generating suggestions:', error);
      return [];
    }
  }

  async generateMarketingContent(
    type: 'email' | 'social' | 'sms' | 'blog',
    context: {
      restaurant?: string;
      promotion?: string;
      audience?: string;
      tone?: string;
      length?: 'short' | 'medium' | 'long';
    }
  ): Promise<string> {
    const prompts = {
      email: `Create a marketing email for a restaurant. Restaurant: ${context.restaurant || 'Modern American Bistro'}. Promotion: ${context.promotion || 'Weekend special'}. Audience: ${context.audience || 'regular customers'}. Tone: ${context.tone || 'friendly and inviting'}.`,
      social: `Create a social media post for a restaurant. Restaurant: ${context.restaurant}. Promotion: ${context.promotion}. Make it engaging and shareable. Include relevant hashtags.`,
      sms: `Create a short SMS marketing message (160 chars max) for a restaurant promotion. Restaurant: ${context.restaurant}. Promotion: ${context.promotion}.`,
      blog: `Write a blog post for a restaurant. Topic: ${context.promotion || 'Seasonal menu highlights'}. Restaurant: ${context.restaurant}. Tone: ${context.tone || 'informative and engaging'}. Length: ${context.length || 'medium'}.`
    };

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.marketingAssistant },
      { role: 'user', content: prompts[type] }
    ];

    const response = await createOpenAIStream(messages, {
      temperature: 0.8,
      max_tokens: type === 'sms' ? 50 : type === 'blog' ? 1000 : 300
    });

    return response;
  }

  async analyzeData(
    data: any[],
    analysisType: 'trend' | 'anomaly' | 'summary' | 'recommendation'
  ): Promise<AIResponse> {
    const dataStr = JSON.stringify(data, null, 2);
    const prompts = {
      trend: `Analyze the following restaurant data and identify key trends: ${dataStr}`,
      anomaly: `Identify any anomalies or unusual patterns in this restaurant data: ${dataStr}`,
      summary: `Provide a comprehensive summary of this restaurant data: ${dataStr}`,
      recommendation: `Based on this restaurant data, provide actionable recommendations: ${dataStr}`
    };

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPTS.dataAnalyst },
      { role: 'user', content: prompts[analysisType] }
    ];

    try {
      const response = await fetch('/api/chat/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, temperature: 0.3, max_tokens: 1000 })
      });

      const data = await response.json();
      
      return {
        message: data.content,
        metadata: { analysisType, dataPoints: data.length }
      };
    } catch (error) {
      console.error('Error analyzing data:', error);
      throw error;
    }
  }

  private getConversationHistory(conversationId: string): ConversationMessage[] {
    return this.conversations.get(conversationId) || [];
  }

  private addToConversation(
    conversationId: string,
    message: Omit<ConversationMessage, 'id' | 'timestamp'>
  ) {
    const history = this.getConversationHistory(conversationId);
    const newMessage: ConversationMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    
    history.push(newMessage);
    this.conversations.set(conversationId, history);
    
    // Limit conversation history to last 50 messages
    if (history.length > 50) {
      this.conversations.set(conversationId, history.slice(-50));
    }
  }

  async persistKnowledge(
    conversationId: string,
    userMessage: string,
    assistantResponse: string,
    context?: ConversationContext
  ) {
    try {
      const knowledge = await extractKnowledge(userMessage, assistantResponse);
      
      if (this.neo4jService && knowledge.entities.length > 0) {
        // Store conversation
        await this.neo4jService.run(`
          CREATE (c:Conversation {
            id: $conversationId,
            timestamp: datetime(),
            userMessage: $userMessage,
            assistantResponse: $assistantResponse,
            context: $context
          })
        `, {
          conversationId,
          userMessage,
          assistantResponse,
          context: JSON.stringify(context || {})
        });

        // Store extracted entities and relationships
        for (const entity of knowledge.entities) {
          await this.neo4jService.run(`
            MERGE (e:Entity {name: $name, type: $type})
            WITH e
            MATCH (c:Conversation {id: $conversationId})
            CREATE (c)-[:MENTIONS]->(e)
          `, {
            name: entity.name,
            type: entity.type,
            conversationId
          });
        }

        // Store insights
        for (const insight of knowledge.insights) {
          await this.neo4jService.run(`
            MATCH (c:Conversation {id: $conversationId})
            CREATE (i:Insight {
              type: $type,
              content: $content,
              confidence: $confidence,
              timestamp: datetime()
            })
            CREATE (c)-[:GENERATED]->(i)
          `, {
            conversationId,
            type: insight.type,
            content: insight.content,
            confidence: insight.confidence
          });
        }
      }
    } catch (error) {
      console.error('Error persisting knowledge:', error);
    }
  }

  exportConversation(conversationId: string): string {
    const history = this.getConversationHistory(conversationId);
    
    const exportData = {
      conversationId,
      exportDate: new Date().toISOString(),
      messages: history.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        metadata: msg.metadata
      }))
    };

    return JSON.stringify(exportData, null, 2);
  }

  clearConversation(conversationId: string) {
    this.conversations.delete(conversationId);
  }
}