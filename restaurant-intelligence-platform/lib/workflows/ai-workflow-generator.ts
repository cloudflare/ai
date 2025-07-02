import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Workflow, WorkflowSchema } from '@/lib/types';
import { WorkflowStep, WorkflowTrigger } from './workflow-types';

// Extended workflow step schema with mandatory config
export const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(['transform', 'validate', 'enrich', 'aggregate', 'distribute', 'monitor', 'query', 'compute']),
  name: z.string(),
  description: z.string().optional(),
  config: z.record(z.any()).refine(
    (config) => Object.keys(config).length > 0,
    { message: 'Config must not be empty' }
  ),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  errorHandling: z.object({
    strategy: z.enum(['retry', 'fallback', 'skip', 'fail', 'compensate']),
    retryConfig: z.object({
      maxAttempts: z.number().min(1).max(10),
      backoffMultiplier: z.number().min(1).max(5),
      maxDelay: z.number().min(1000).max(300000),
      initialDelay: z.number().min(100).max(10000),
    }).optional(),
    fallbackStep: z.string().optional(),
    compensationStep: z.string().optional(),
    alertOnError: z.boolean().default(true),
  }).optional(),
  performance: z.object({
    timeout: z.number().min(1000).max(3600000), // 1s to 1h
    concurrency: z.number().min(1).max(100),
    batchSize: z.number().min(1).max(10000).optional(),
    rateLimit: z.object({
      requests: z.number().min(1),
      window: z.number().min(1000), // milliseconds
    }).optional(),
    caching: z.object({
      enabled: z.boolean(),
      ttl: z.number().min(0), // 0 = infinite
      strategy: z.enum(['lru', 'fifo', 'lfu']),
      maxSize: z.number().min(1),
    }).optional(),
  }).optional(),
  authentication: z.object({
    type: z.enum(['api_key', 'oauth2', 'basic', 'bearer', 'custom']),
    config: z.record(z.any()),
  }).optional(),
  monitoring: z.object({
    metrics: z.array(z.string()),
    logging: z.object({
      level: z.enum(['debug', 'info', 'warn', 'error']),
      includePayload: z.boolean(),
    }),
    tracing: z.boolean(),
  }).optional(),
});

// Workflow trigger schema
export const WorkflowTriggerSchema = z.object({
  type: z.enum(['schedule', 'event', 'webhook', 'manual', 'condition', 'chain']),
  config: z.record(z.any()).refine(
    (config) => Object.keys(config).length > 0,
    { message: 'Trigger config must not be empty' }
  ),
});

// Complete workflow schema with validation
export const CompleteWorkflowSchema = WorkflowSchema.extend({
  steps: z.array(WorkflowStepSchema).min(1),
  trigger: WorkflowTriggerSchema,
  metadata: z.object({
    version: z.string(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    estimatedDuration: z.number().optional(),
    complexity: z.enum(['low', 'medium', 'high', 'extreme']).optional(),
    aiGenerated: z.boolean().optional(),
    trizPrinciples: z.array(z.number()).optional(),
  }).optional(),
});

export type CompleteWorkflow = z.infer<typeof CompleteWorkflowSchema>;
export type CompleteWorkflowStep = z.infer<typeof WorkflowStepSchema>;

// AI model configuration
const AI_MODEL_CONFIG = {
  temperature: 0.7,
  maxTokens: 4000,
  model: 'gpt-4-turbo-preview',
};

// Step configuration templates
const STEP_CONFIG_TEMPLATES = {
  transform: {
    source: {
      type: 'database',
      connectionString: '${env.SOURCE_DB_URL}',
      query: 'SELECT * FROM ${table}',
    },
    transformation: {
      mapping: {},
      validation: true,
      enrichment: false,
    },
    destination: {
      type: 'database',
      connectionString: '${env.DEST_DB_URL}',
      table: '${table}_transformed',
      upsertKey: 'id',
    },
  },
  validate: {
    schema: {
      type: 'zod',
      definition: {},
    },
    rules: [],
    onInvalid: 'reject',
    reporting: {
      enabled: true,
      destination: 'logs',
    },
  },
  enrich: {
    sources: [],
    fields: [],
    strategy: 'parallel',
    cache: {
      enabled: true,
      ttl: 3600000,
    },
  },
  aggregate: {
    groupBy: [],
    metrics: [],
    window: {
      type: 'tumbling',
      size: 300000,
    },
    output: {
      format: 'json',
      destination: 'stream',
    },
  },
  distribute: {
    destinations: [],
    routing: {
      strategy: 'round-robin',
      rules: [],
    },
    delivery: {
      guarantees: 'at-least-once',
      compression: true,
    },
  },
  monitor: {
    targets: [],
    checks: [],
    alerting: {
      enabled: true,
      channels: ['email', 'slack'],
      thresholds: {},
    },
  },
  query: {
    database: {
      type: 'neo4j',
      connectionString: '${env.NEO4J_URI}',
    },
    query: '',
    parameters: {},
    resultFormat: 'json',
  },
  compute: {
    algorithm: '',
    inputs: {},
    outputs: {},
    resources: {
      cpu: 1,
      memory: '1Gi',
      gpu: false,
    },
  },
};

export class AIWorkflowGenerator {
  private aiProvider: any; // Will be injected or use OpenAI

  constructor(aiProvider?: any) {
    this.aiProvider = aiProvider;
  }

  /**
   * Generate a complete workflow using AI based on requirements
   */
  async generateWorkflow(requirements: {
    goal: string;
    dataSources: string[];
    dataTypes?: string[];
    constraints?: {
      maxDuration?: number;
      maxCost?: number;
      requiredAccuracy?: number;
      security?: string[];
    };
    preferences?: {
      optimizeFor?: 'speed' | 'accuracy' | 'cost' | 'reliability';
      preferredTools?: string[];
      avoidTools?: string[];
    };
    context?: {
      restaurantPlatforms?: string[];
      existingIntegrations?: string[];
      teamCapabilities?: string[];
    };
  }): Promise<CompleteWorkflow> {
    // Build AI prompt
    const prompt = this.buildWorkflowPrompt(requirements);
    
    // Generate workflow structure using AI
    const aiResponse = await this.callAI(prompt);
    
    // Parse and validate AI response
    const rawWorkflow = this.parseAIResponse(aiResponse);
    
    // Enhance with complete configurations
    const enhancedWorkflow = await this.enhanceWorkflowConfigs(rawWorkflow, requirements);
    
    // Validate the complete workflow
    const validatedWorkflow = this.validateWorkflow(enhancedWorkflow);
    
    return validatedWorkflow;
  }

  /**
   * Build a comprehensive prompt for AI workflow generation
   */
  private buildWorkflowPrompt(requirements: any): string {
    return `Generate a complete restaurant data workflow with the following requirements:

Goal: ${requirements.goal}
Data Sources: ${requirements.dataSources.join(', ')}
Data Types: ${requirements.dataTypes?.join(', ') || 'all available'}

Constraints:
- Max Duration: ${requirements.constraints?.maxDuration || 'no limit'} ms
- Max Cost: ${requirements.constraints?.maxCost || 'no limit'}
- Required Accuracy: ${requirements.constraints?.requiredAccuracy || 0.95}
- Security Requirements: ${requirements.constraints?.security?.join(', ') || 'standard'}

Preferences:
- Optimize for: ${requirements.preferences?.optimizeFor || 'balanced'}
- Preferred Tools: ${requirements.preferences?.preferredTools?.join(', ') || 'any'}
- Avoid Tools: ${requirements.preferences?.avoidTools?.join(', ') || 'none'}

Context:
- Restaurant Platforms: ${requirements.context?.restaurantPlatforms?.join(', ') || 'toast, opentable, 7shifts'}
- Existing Integrations: ${requirements.context?.existingIntegrations?.join(', ') || 'none'}
- Team Capabilities: ${requirements.context?.teamCapabilities?.join(', ') || 'full-stack'}

Generate a workflow with:
1. Appropriate trigger configuration
2. Step-by-step process with complete configurations
3. Error handling and retry policies
4. Performance optimizations
5. Security and authentication details
6. Monitoring and alerting setup

Each step MUST include:
- Unique ID and descriptive name
- Type (transform, validate, enrich, aggregate, distribute, monitor, query, compute)
- Complete config object with all necessary parameters
- Error handling strategy
- Performance settings
- Authentication if needed

Format the response as a JSON workflow object.`;
  }

  /**
   * Call AI model to generate workflow
   */
  private async callAI(prompt: string): Promise<string> {
    if (this.aiProvider) {
      // Use injected AI provider
      const response = await this.aiProvider.generateText({
        prompt,
        ...AI_MODEL_CONFIG,
      });
      return response.text;
    }
    
    // Fallback to a mock response for testing
    return this.getMockAIResponse();
  }

  /**
   * Parse AI response into workflow structure
   */
  private parseAIResponse(response: string): any {
    try {
      // Extract JSON from response (AI might include explanation text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw new Error('Invalid AI response format');
    }
  }

  /**
   * Enhance workflow with complete configurations
   */
  private async enhanceWorkflowConfigs(
    workflow: any,
    requirements: any
  ): Promise<CompleteWorkflow> {
    const enhancedSteps = await Promise.all(
      workflow.steps.map(async (step: any) => {
        const baseConfig = STEP_CONFIG_TEMPLATES[step.type as keyof typeof STEP_CONFIG_TEMPLATES] || {};
        
        return {
          ...step,
          config: {
            ...baseConfig,
            ...step.config,
            // Ensure all required fields are present
            _enhanced: true,
            _timestamp: new Date().toISOString(),
          },
          errorHandling: step.errorHandling || {
            strategy: 'retry',
            retryConfig: {
              maxAttempts: 3,
              backoffMultiplier: 2,
              maxDelay: 30000,
              initialDelay: 1000,
            },
            alertOnError: true,
          },
          performance: step.performance || {
            timeout: 60000,
            concurrency: 5,
          },
          monitoring: {
            metrics: ['duration', 'success_rate', 'throughput'],
            logging: {
              level: 'info',
              includePayload: false,
            },
            tracing: true,
          },
        };
      })
    );

    return {
      ...workflow,
      id: workflow.id || `ai-generated-${Date.now()}`,
      name: workflow.name || `AI: ${requirements.goal}`,
      description: workflow.description || `AI-generated workflow for: ${requirements.goal}`,
      trigger: {
        ...workflow.trigger,
        config: {
          ...this.getDefaultTriggerConfig(workflow.trigger.type),
          ...workflow.trigger.config,
        },
      },
      steps: enhancedSteps,
      status: 'draft',
      metadata: {
        version: '1.0.0',
        author: 'AI Workflow Generator',
        tags: ['ai-generated', ...requirements.dataSources],
        estimatedDuration: this.estimateWorkflowDuration(enhancedSteps),
        complexity: this.calculateComplexity(enhancedSteps),
        aiGenerated: true,
        generatedAt: new Date().toISOString(),
        requirements: requirements,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get default trigger configuration
   */
  private getDefaultTriggerConfig(triggerType: string): Record<string, any> {
    switch (triggerType) {
      case 'schedule':
        return {
          cron: '0 */15 * * *',
          timezone: 'America/New_York',
          missedRunHandling: 'skip',
        };
      case 'event':
        return {
          eventType: 'data-update',
          source: 'system',
          filters: {},
        };
      case 'webhook':
        return {
          method: 'POST',
          authType: 'bearer',
          validatePayload: true,
          responseTimeout: 5000,
        };
      case 'manual':
        return {
          requiresApproval: false,
          allowedUsers: [],
        };
      case 'condition':
        return {
          expression: '',
          checkInterval: 60000,
          timeout: 300000,
        };
      case 'chain':
        return {
          parentWorkflowId: '',
          waitForCompletion: true,
          inheritContext: true,
        };
      default:
        return {};
    }
  }

  /**
   * Validate workflow against schema
   */
  private validateWorkflow(workflow: any): CompleteWorkflow {
    try {
      return CompleteWorkflowSchema.parse(workflow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Workflow validation errors:', error.errors);
        throw new Error(`Workflow validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Estimate workflow duration based on steps
   */
  private estimateWorkflowDuration(steps: any[]): number {
    return steps.reduce((total, step) => {
      const stepDuration = step.performance?.timeout || 60000;
      const concurrency = step.performance?.concurrency || 1;
      return total + (stepDuration / concurrency);
    }, 0);
  }

  /**
   * Calculate workflow complexity
   */
  private calculateComplexity(steps: any[]): 'low' | 'medium' | 'high' | 'extreme' {
    const score = steps.reduce((total, step) => {
      let stepScore = 1;
      
      // Add complexity based on step type
      if (['compute', 'aggregate', 'enrich'].includes(step.type)) stepScore += 2;
      if (step.type === 'transform' && step.config.transformation?.mapping) stepScore += 1;
      
      // Add complexity for error handling
      if (step.errorHandling?.strategy === 'compensate') stepScore += 2;
      
      // Add complexity for performance requirements
      if (step.performance?.concurrency > 10) stepScore += 1;
      if (step.performance?.rateLimit) stepScore += 1;
      
      return total + stepScore;
    }, 0);
    
    if (score < 5) return 'low';
    if (score < 10) return 'medium';
    if (score < 20) return 'high';
    return 'extreme';
  }

  /**
   * Get mock AI response for testing
   */
  private getMockAIResponse(): string {
    return JSON.stringify({
      name: 'Restaurant Data ETL Pipeline',
      description: 'Extract, transform, and load restaurant data from multiple sources',
      trigger: {
        type: 'schedule',
        config: {
          cron: '0 */30 * * *',
          timezone: 'America/New_York',
        },
      },
      steps: [
        {
          id: 'extract-toast-data',
          type: 'query',
          name: 'Extract Toast POS Data',
          config: {
            database: {
              type: 'api',
              endpoint: 'https://api.toasttab.com/v2',
              auth: {
                type: 'bearer',
                token: '${env.TOAST_API_TOKEN}',
              },
            },
            queries: [
              {
                name: 'orders',
                path: '/orders',
                params: {
                  startDate: '${context.startDate}',
                  endDate: '${context.endDate}',
                },
              },
              {
                name: 'menu',
                path: '/menu/items',
              },
            ],
            pagination: {
              type: 'cursor',
              pageSize: 100,
            },
          },
        },
        {
          id: 'validate-toast-data',
          type: 'validate',
          name: 'Validate Toast Data',
          config: {
            schema: {
              type: 'zod',
              definition: {
                orders: 'OrderSchema',
                menu: 'MenuItemSchema',
              },
            },
            rules: [
              {
                field: 'orders.total',
                operator: 'gte',
                value: 0,
              },
              {
                field: 'menu.price',
                operator: 'gte',
                value: 0,
              },
            ],
            onInvalid: 'quarantine',
            reporting: {
              enabled: true,
              destination: 'monitoring',
            },
          },
        },
        {
          id: 'transform-to-canonical',
          type: 'transform',
          name: 'Transform to Canonical Format',
          config: {
            source: {
              type: 'memory',
              data: '${steps.extract-toast-data.output}',
            },
            transformation: {
              mapping: {
                orders: {
                  id: 'guid',
                  restaurantId: 'location.id',
                  platform: '"toast"',
                  externalOrderId: 'id',
                  status: 'state',
                  orderType: 'diningOption.mode',
                  subtotal: 'amounts.subtotal',
                  tax: 'amounts.tax',
                  total: 'amounts.total',
                },
              },
              validation: true,
              enrichment: true,
            },
            destination: {
              type: 'memory',
              format: 'canonical',
            },
          },
        },
        {
          id: 'enrich-with-analytics',
          type: 'enrich',
          name: 'Enrich with Analytics',
          config: {
            sources: [
              {
                type: 'calculation',
                name: 'orderMetrics',
                calculations: [
                  {
                    name: 'averageOrderValue',
                    formula: 'sum(total) / count(id)',
                  },
                  {
                    name: 'orderFrequency',
                    formula: 'count(id) / uniqueCount(customerId)',
                  },
                ],
              },
              {
                type: 'lookup',
                name: 'customerSegment',
                source: 'neo4j',
                query: 'MATCH (c:Customer {id: $customerId}) RETURN c.segment',
              },
            ],
            fields: ['orderMetrics', 'customerSegment'],
            strategy: 'parallel',
            cache: {
              enabled: true,
              ttl: 3600000,
            },
          },
        },
        {
          id: 'load-to-destinations',
          type: 'distribute',
          name: 'Load to Data Stores',
          config: {
            destinations: [
              {
                name: 'neo4j',
                type: 'graph',
                connection: '${env.NEO4J_URI}',
                operations: [
                  {
                    type: 'merge',
                    query: 'MERGE (o:Order {id: $id}) SET o += $properties',
                  },
                ],
              },
              {
                name: 'snowflake',
                type: 'warehouse',
                connection: '${env.SNOWFLAKE_CONNECTION}',
                table: 'restaurant_orders',
                mode: 'append',
              },
            ],
            routing: {
              strategy: 'all',
              rules: [],
            },
            delivery: {
              guarantees: 'exactly-once',
              compression: true,
              batchSize: 1000,
            },
          },
        },
      ],
    });
  }

  /**
   * Convert workflow to JSON Schema
   */
  getWorkflowJsonSchema(): any {
    return zodToJsonSchema(CompleteWorkflowSchema);
  }

  /**
   * Validate a workflow configuration
   */
  validateWorkflowConfig(workflow: any): { valid: boolean; errors?: any[] } {
    try {
      CompleteWorkflowSchema.parse(workflow);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { valid: false, errors: error.errors };
      }
      return { valid: false, errors: [{ message: 'Unknown validation error' }] };
    }
  }
}