import { Agent } from '@openai/agents';
import { tools } from '@openai/agents-extensions';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { models } from '../providers';
import { runQuery, graphHelpers } from '@/lib/db/neo4j';
import { 
  RestaurantEntity, 
  MenuItem, 
  Order, 
  Metric,
  Alert,
  GraphNode,
  GraphRelationship
} from '@/lib/types';

// Agent capabilities definition
export const AGENT_CAPABILITIES = {
  ANALYTICS: 'analytics',
  OPERATIONS: 'operations',
  CUSTOMER_INSIGHTS: 'customer_insights',
  MENU_OPTIMIZATION: 'menu_optimization',
  STAFF_MANAGEMENT: 'staff_management',
  PREDICTIVE_MODELING: 'predictive_modeling',
  KNOWLEDGE_EXTRACTION: 'knowledge_extraction',
} as const;

// Agent configuration
export interface RestaurantAgentConfig {
  apiKey: string;
  restaurantId: string;
  capabilities?: Array<keyof typeof AGENT_CAPABILITIES>;
  memoryStore?: 'neo4j' | 'in-memory';
}

// Context schema for agent memory
const AgentContextSchema = z.object({
  restaurantId: z.string(),
  conversationId: z.string(),
  userRole: z.string().optional(),
  timeRange: z.object({
    start: z.date(),
    end: z.date(),
  }).optional(),
  preferences: z.record(z.any()).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.date(),
    metadata: z.record(z.any()).optional(),
  })),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

// Main Restaurant Intelligence Agent
export class RestaurantIntelligenceAgent {
  private agent: Agent;
  private config: RestaurantAgentConfig;
  private context: AgentContext;
  
  constructor(config: RestaurantAgentConfig) {
    this.config = config;
    
    // Initialize OpenAI Agent
    this.agent = new Agent({
      apiKey: config.apiKey,
      model: 'gpt-4o',
      timeout: 60000,
      tools: this.buildTools(),
      instructions: this.buildInstructions(),
    });
    
    // Initialize context
    this.context = {
      restaurantId: config.restaurantId,
      conversationId: `conv_${Date.now()}`,
      history: [],
    };
  }
  
  // Build agent tools based on capabilities
  private buildTools() {
    const agentTools = [
      // Code execution for data analysis
      tools.code_interpreter,
      
      // Custom tools for restaurant operations
      {
        type: 'function' as const,
        function: {
          name: 'analyze_metrics',
          description: 'Analyze restaurant metrics and generate insights',
          parameters: {
            type: 'object',
            properties: {
              metricTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Types of metrics to analyze (e.g., sales, labor, customer_satisfaction)',
              },
              timeRange: {
                type: 'object',
                properties: {
                  start: { type: 'string', format: 'date-time' },
                  end: { type: 'string', format: 'date-time' },
                },
              },
              comparison: {
                type: 'string',
                enum: ['day-over-day', 'week-over-week', 'month-over-month', 'year-over-year'],
              },
            },
            required: ['metricTypes'],
          },
          function: this.analyzeMetrics.bind(this),
        },
      },
      
      {
        type: 'function' as const,
        function: {
          name: 'query_knowledge_graph',
          description: 'Query the restaurant knowledge graph for relationships and insights',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language query about restaurant data',
              },
              entityTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Types of entities to include (e.g., MenuItem, Customer, Employee)',
              },
              depth: {
                type: 'number',
                description: 'How many relationship hops to traverse',
                default: 2,
              },
            },
            required: ['query'],
          },
          function: this.queryKnowledgeGraph.bind(this),
        },
      },
      
      {
        type: 'function' as const,
        function: {
          name: 'generate_recommendation',
          description: 'Generate actionable recommendations based on data analysis',
          parameters: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['menu', 'staffing', 'marketing', 'operations', 'customer_experience'],
              },
              dataPoints: {
                type: 'array',
                items: { type: 'object' },
                description: 'Relevant data points for recommendation',
              },
              urgency: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical'],
              },
            },
            required: ['category', 'dataPoints'],
          },
          function: this.generateRecommendation.bind(this),
        },
      },
      
      {
        type: 'function' as const,
        function: {
          name: 'save_to_graph',
          description: 'Save insights, entities, and relationships to the knowledge graph',
          parameters: {
            type: 'object',
            properties: {
              entities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    labels: { type: 'array', items: { type: 'string' } },
                    properties: { type: 'object' },
                  },
                },
              },
              relationships: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    target: { type: 'string' },
                    type: { type: 'string' },
                    properties: { type: 'object' },
                  },
                },
              },
            },
          },
          function: this.saveToGraph.bind(this),
        },
      },
    ];
    
    return agentTools;
  }
  
  // Build agent instructions based on capabilities
  private buildInstructions(): string {
    const baseInstructions = `
You are an advanced Restaurant Intelligence Agent specializing in data-driven insights and operational excellence.

Your core responsibilities:
1. Analyze restaurant data to identify trends, anomalies, and opportunities
2. Provide actionable recommendations based on comprehensive data analysis
3. Extract and build knowledge from conversations to enhance the restaurant's intelligence graph
4. Support decision-making with predictive analytics and what-if scenarios

Key principles:
- Always ground insights in data
- Consider both immediate and long-term impacts
- Balance operational efficiency with customer experience
- Maintain context across conversations
- Build and leverage the knowledge graph for deeper insights

Restaurant Context:
- Restaurant ID: ${this.config.restaurantId}
- Available capabilities: ${this.config.capabilities?.join(', ') || 'all'}
`;

    const capabilityInstructions = {
      [AGENT_CAPABILITIES.ANALYTICS]: `
Analytics Focus:
- Identify trends in sales, labor, and customer behavior
- Detect anomalies that require attention
- Provide comparative analysis across time periods
- Generate visualizable insights
`,
      [AGENT_CAPABILITIES.OPERATIONS]: `
Operations Focus:
- Monitor operational efficiency metrics
- Identify bottlenecks and inefficiencies
- Suggest process improvements
- Track compliance and quality metrics
`,
      [AGENT_CAPABILITIES.CUSTOMER_INSIGHTS]: `
Customer Insights Focus:
- Analyze customer preferences and behavior
- Identify customer segments and patterns
- Track satisfaction and loyalty metrics
- Suggest personalization strategies
`,
      [AGENT_CAPABILITIES.MENU_OPTIMIZATION]: `
Menu Optimization Focus:
- Analyze item performance and profitability
- Identify cross-selling opportunities
- Suggest pricing optimizations
- Track dietary trends and preferences
`,
      [AGENT_CAPABILITIES.STAFF_MANAGEMENT]: `
Staff Management Focus:
- Analyze labor efficiency and scheduling
- Identify training needs
- Track employee performance metrics
- Suggest optimal staffing levels
`,
      [AGENT_CAPABILITIES.PREDICTIVE_MODELING]: `
Predictive Modeling Focus:
- Forecast future metrics based on historical data
- Identify risk factors and early warnings
- Model what-if scenarios
- Predict customer demand patterns
`,
      [AGENT_CAPABILITIES.KNOWLEDGE_EXTRACTION]: `
Knowledge Extraction Focus:
- Extract entities and relationships from conversations
- Build comprehensive knowledge graphs
- Identify implicit connections in data
- Maintain conversation context and history
`,
    };
    
    const selectedInstructions = this.config.capabilities
      ?.map(cap => capabilityInstructions[cap])
      .filter(Boolean)
      .join('\n') || Object.values(capabilityInstructions).join('\n');
    
    return baseInstructions + selectedInstructions;
  }
  
  // Tool implementation: Analyze metrics
  private async analyzeMetrics(params: {
    metricTypes: string[];
    timeRange?: { start: string; end: string };
    comparison?: string;
  }) {
    // Query metrics from Neo4j
    const query = `
      MATCH (r:Restaurant {id: $restaurantId})-[:HAS_METRIC]->(m:Metric)
      WHERE m.type IN $metricTypes
      ${params.timeRange ? 'AND m.timestamp >= datetime($start) AND m.timestamp <= datetime($end)' : ''}
      RETURN m
      ORDER BY m.timestamp DESC
    `;
    
    const metrics = await runQuery<{ m: Metric }>(query, {
      restaurantId: this.config.restaurantId,
      metricTypes: params.metricTypes,
      ...(params.timeRange && {
        start: params.timeRange.start,
        end: params.timeRange.end,
      }),
    });
    
    // Perform analysis using AI
    const analysis = await generateObject({
      model: models.standard.openai,
      prompt: `Analyze these restaurant metrics and provide insights:
      
Metrics: ${JSON.stringify(metrics, null, 2)}
Comparison: ${params.comparison || 'none'}

Generate comprehensive analysis including trends, anomalies, and recommendations.`,
      schema: z.object({
        summary: z.string(),
        trends: z.array(z.object({
          metric: z.string(),
          direction: z.enum(['up', 'down', 'stable']),
          magnitude: z.number(),
          significance: z.enum(['low', 'medium', 'high']),
        })),
        anomalies: z.array(z.object({
          metric: z.string(),
          description: z.string(),
          severity: z.enum(['low', 'medium', 'high', 'critical']),
        })),
        recommendations: z.array(z.string()),
      }),
    });
    
    return analysis.object;
  }
  
  // Tool implementation: Query knowledge graph
  private async queryKnowledgeGraph(params: {
    query: string;
    entityTypes?: string[];
    depth?: number;
  }) {
    // Convert natural language to Cypher query
    const cypherQuery = await generateText({
      model: models.fast.openai,
      prompt: `Convert this natural language query to a Cypher query for Neo4j:

Query: ${params.query}
Entity Types: ${params.entityTypes?.join(', ') || 'all'}
Max Depth: ${params.depth || 2}
Restaurant ID: ${this.config.restaurantId}

Generate a safe, read-only Cypher query that starts from the restaurant node.`,
    });
    
    // Execute the query
    try {
      const results = await runQuery(cypherQuery.text);
      
      // Process and structure the results
      const structured = await generateObject({
        model: models.fast.openai,
        prompt: `Structure these graph query results into a meaningful response:
        
Query: ${params.query}
Results: ${JSON.stringify(results, null, 2)}

Provide a structured summary with key findings and relationships.`,
        schema: z.object({
          summary: z.string(),
          entities: z.array(z.object({
            type: z.string(),
            id: z.string(),
            name: z.string(),
            properties: z.record(z.any()),
          })),
          relationships: z.array(z.object({
            type: z.string(),
            source: z.string(),
            target: z.string(),
            properties: z.record(z.any()),
          })),
          insights: z.array(z.string()),
        }),
      });
      
      return structured.object;
    } catch (error) {
      console.error('Graph query error:', error);
      return {
        error: 'Failed to query knowledge graph',
        query: cypherQuery.text,
      };
    }
  }
  
  // Tool implementation: Generate recommendation
  private async generateRecommendation(params: {
    category: string;
    dataPoints: any[];
    urgency?: string;
  }) {
    const recommendation = await generateObject({
      model: models.standard.openai,
      prompt: `Generate actionable recommendations for restaurant operations:

Category: ${params.category}
Data Points: ${JSON.stringify(params.dataPoints, null, 2)}
Urgency: ${params.urgency || 'medium'}
Restaurant Context: ${this.config.restaurantId}

Provide specific, implementable recommendations with expected impact.`,
      schema: z.object({
        title: z.string(),
        description: z.string(),
        actions: z.array(z.object({
          step: z.number(),
          action: z.string(),
          resources: z.array(z.string()),
          timeline: z.string(),
        })),
        expectedImpact: z.object({
          metric: z.string(),
          improvement: z.string(),
          confidence: z.number().min(0).max(1),
        }),
        risks: z.array(z.string()),
        alternativeApproaches: z.array(z.string()),
      }),
    });
    
    return recommendation.object;
  }
  
  // Tool implementation: Save to graph
  private async saveToGraph(params: {
    entities?: Array<{ labels: string[]; properties: any }>;
    relationships?: Array<{
      source: string;
      target: string;
      type: string;
      properties: any;
    }>;
  }) {
    const results = {
      entities: [] as any[],
      relationships: [] as any[],
    };
    
    // Save entities
    if (params.entities) {
      for (const entity of params.entities) {
        const node = await graphHelpers.createNode(
          entity.labels,
          {
            ...entity.properties,
            conversationId: this.context.conversationId,
            restaurantId: this.config.restaurantId,
          }
        );
        results.entities.push(node);
      }
    }
    
    // Save relationships
    if (params.relationships) {
      for (const rel of params.relationships) {
        const relationship = await graphHelpers.createRelationship(
          rel.source,
          rel.target,
          rel.type,
          {
            ...rel.properties,
            conversationId: this.context.conversationId,
          }
        );
        results.relationships.push(relationship);
      }
    }
    
    return results;
  }
  
  // Main interaction method
  async processMessage(message: string, options?: {
    stream?: boolean;
    saveToGraph?: boolean;
    context?: Partial<AgentContext>;
  }): Promise<{
    response: string;
    metadata?: any;
    extractedKnowledge?: any;
  }> {
    // Update context
    if (options?.context) {
      this.context = { ...this.context, ...options.context };
    }
    
    // Add message to history
    this.context.history.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });
    
    try {
      // Process with agent
      const completion = await this.agent.run({
        messages: [
          {
            role: 'system',
            content: this.buildInstructions(),
          },
          ...this.context.history.map(h => ({
            role: h.role,
            content: h.content,
          })),
        ],
        stream: options?.stream,
      });
      
      // Extract response
      const response = completion.choices[0].message.content || '';
      
      // Add response to history
      this.context.history.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      });
      
      // Extract and save knowledge if requested
      let extractedKnowledge;
      if (options?.saveToGraph) {
        extractedKnowledge = await this.extractKnowledge(message, response);
      }
      
      return {
        response,
        metadata: {
          conversationId: this.context.conversationId,
          toolCalls: completion.choices[0].message.tool_calls,
        },
        extractedKnowledge,
      };
      
    } catch (error) {
      console.error('Agent processing error:', error);
      throw error;
    }
  }
  
  // Extract knowledge from conversation
  private async extractKnowledge(userMessage: string, agentResponse: string) {
    const extraction = await generateObject({
      model: models.standard.anthropic,
      prompt: `Extract entities and relationships from this restaurant conversation:

User: ${userMessage}
Assistant: ${agentResponse}

Focus on:
- Restaurant operations entities (metrics, alerts, insights)
- Customer preferences and behaviors
- Menu items and performance
- Staff and scheduling information
- Any actionable insights or decisions

Return entities with their properties and relationships between them.`,
      schema: z.object({
        entities: z.array(z.object({
          id: z.string(),
          labels: z.array(z.string()),
          properties: z.record(z.any()),
          confidence: z.number().min(0).max(1),
        })),
        relationships: z.array(z.object({
          sourceId: z.string(),
          targetId: z.string(),
          type: z.string(),
          properties: z.record(z.any()),
          confidence: z.number().min(0).max(1),
        })),
        insights: z.array(z.object({
          type: z.string(),
          description: z.string(),
          entities: z.array(z.string()),
        })),
      }),
    });
    
    // Save high-confidence extractions to graph
    const highConfidenceEntities = extraction.object.entities.filter(e => e.confidence > 0.7);
    const highConfidenceRelationships = extraction.object.relationships.filter(r => r.confidence > 0.7);
    
    if (highConfidenceEntities.length > 0 || highConfidenceRelationships.length > 0) {
      await this.saveToGraph({
        entities: highConfidenceEntities.map(e => ({
          labels: e.labels,
          properties: { ...e.properties, extractionConfidence: e.confidence },
        })),
        relationships: highConfidenceRelationships.map(r => ({
          source: r.sourceId,
          target: r.targetId,
          type: r.type,
          properties: { ...r.properties, extractionConfidence: r.confidence },
        })),
      });
    }
    
    return extraction.object;
  }
  
  // Get conversation history
  getHistory(): AgentContext['history'] {
    return this.context.history;
  }
  
  // Clear conversation history
  clearHistory(): void {
    this.context.history = [];
    this.context.conversationId = `conv_${Date.now()}`;
  }
  
  // Update agent context
  updateContext(updates: Partial<AgentContext>): void {
    this.context = { ...this.context, ...updates };
  }
}