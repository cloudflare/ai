import { createOpenAIStream, SYSTEM_PROMPTS } from './openai-stream';

export interface ExtractedEntity {
  name: string;
  type: 'Restaurant' | 'Location' | 'Metric' | 'Date' | 'Product' | 'Person' | 'Other';
  confidence: number;
  context?: string;
}

export interface ExtractedRelationship {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}

export interface ExtractedInsight {
  type: 'trend' | 'anomaly' | 'recommendation' | 'fact' | 'prediction';
  content: string;
  confidence: number;
  entities?: string[];
}

export interface ExtractedKnowledge {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  insights: ExtractedInsight[];
  topics: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  actionItems?: string[];
}

const EXTRACTION_PROMPT = `
You are a knowledge extraction specialist for restaurant data. Extract structured information from the conversation.

Return a JSON object with the following structure:
{
  "entities": [
    {
      "name": "entity name",
      "type": "Restaurant|Location|Metric|Date|Product|Person|Other",
      "confidence": 0.0-1.0,
      "context": "optional context"
    }
  ],
  "relationships": [
    {
      "source": "entity name",
      "target": "entity name", 
      "type": "relationship type",
      "properties": {}
    }
  ],
  "insights": [
    {
      "type": "trend|anomaly|recommendation|fact|prediction",
      "content": "insight description",
      "confidence": 0.0-1.0,
      "entities": ["related entities"]
    }
  ],
  "topics": ["topic1", "topic2"],
  "sentiment": "positive|negative|neutral",
  "actionItems": ["action1", "action2"]
}

Extract all relevant information about restaurants, locations, metrics, dates, and business insights.
`;

export async function extractKnowledge(
  userMessage: string,
  assistantResponse: string
): Promise<ExtractedKnowledge> {
  const conversation = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;
  
  try {
    const response = await fetch('/api/chat/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: conversation }
        ],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    const extracted = JSON.parse(data.content);

    return validateExtractedKnowledge(extracted);
  } catch (error) {
    console.error('Knowledge extraction error:', error);
    return {
      entities: [],
      relationships: [],
      insights: [],
      topics: []
    };
  }
}

export async function extractEntitiesFromText(text: string): Promise<ExtractedEntity[]> {
  try {
    const response = await fetch('/api/chat/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { 
            role: 'system', 
            content: 'Extract entities (restaurants, locations, metrics, dates, products, people) from the text. Return a JSON array of entities with name, type, and confidence.'
          },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const data = await response.json();
    const entities = JSON.parse(data.content);
    
    return Array.isArray(entities) ? entities : [];
  } catch (error) {
    console.error('Entity extraction error:', error);
    return [];
  }
}

export async function generateInsights(
  data: any[],
  context?: string
): Promise<ExtractedInsight[]> {
  const dataStr = JSON.stringify(data, null, 2);
  const prompt = `Analyze this restaurant data and generate insights:\n${dataStr}\n${context ? `Context: ${context}` : ''}`;

  try {
    const response = await fetch('/api/chat/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { 
            role: 'system', 
            content: 'Generate insights from restaurant data. Return a JSON array of insights with type (trend/anomaly/recommendation/fact/prediction), content, confidence, and related entities.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 1000
      })
    });

    const data = await response.json();
    const insights = JSON.parse(data.content);
    
    return Array.isArray(insights) ? insights : [];
  } catch (error) {
    console.error('Insight generation error:', error);
    return [];
  }
}

export async function classifyTopic(text: string): Promise<string[]> {
  const topics = [
    'Sales Performance',
    'Customer Experience',
    'Operations',
    'Marketing',
    'Inventory',
    'Staffing',
    'Finance',
    'Compliance',
    'Technology',
    'Menu Analysis'
  ];

  try {
    const response = await fetch('/api/chat/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { 
            role: 'system', 
            content: `Classify the text into relevant topics from this list: ${topics.join(', ')}. Return a JSON array of relevant topics.`
          },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 200
      })
    });

    const data = await response.json();
    const classifiedTopics = JSON.parse(data.content);
    
    return Array.isArray(classifiedTopics) ? classifiedTopics : [];
  } catch (error) {
    console.error('Topic classification error:', error);
    return [];
  }
}

function validateExtractedKnowledge(data: any): ExtractedKnowledge {
  return {
    entities: Array.isArray(data.entities) ? data.entities.filter((e: any) => 
      e.name && e.type && typeof e.confidence === 'number'
    ) : [],
    relationships: Array.isArray(data.relationships) ? data.relationships.filter((r: any) =>
      r.source && r.target && r.type
    ) : [],
    insights: Array.isArray(data.insights) ? data.insights.filter((i: any) =>
      i.type && i.content && typeof i.confidence === 'number'
    ) : [],
    topics: Array.isArray(data.topics) ? data.topics : [],
    sentiment: ['positive', 'negative', 'neutral'].includes(data.sentiment) ? data.sentiment : undefined,
    actionItems: Array.isArray(data.actionItems) ? data.actionItems : undefined
  };
}

export async function streamKnowledgeExtraction(
  text: string,
  onEntity?: (entity: ExtractedEntity) => void,
  onInsight?: (insight: ExtractedInsight) => void,
  onComplete?: (knowledge: ExtractedKnowledge) => void
) {
  const messages = [
    { role: 'system' as const, content: EXTRACTION_PROMPT },
    { role: 'user' as const, content: text }
  ];

  const stream = await createOpenAIStream(messages, {
    temperature: 0.3,
    max_tokens: 1500,
    onComplete: (fullText) => {
      try {
        const knowledge = JSON.parse(fullText);
        const validated = validateExtractedKnowledge(knowledge);
        
        // Call individual callbacks
        validated.entities.forEach(entity => onEntity?.(entity));
        validated.insights.forEach(insight => onInsight?.(insight));
        
        // Call complete callback
        onComplete?.(validated);
      } catch (error) {
        console.error('Error parsing extracted knowledge:', error);
      }
    }
  });

  return stream;
}