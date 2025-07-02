import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CompleteWorkflowSchema, CompleteWorkflow } from './ai-workflow-generator';
import {
  WorkflowStep,
  TransformStepConfig,
  ValidateStepConfig,
  EnrichStepConfig,
  AggregateStepConfig,
  DistributeStepConfig,
  MonitorStepConfig,
  QueryStepConfig,
  ComputeStepConfig,
} from './workflow-types';

// Step-specific configuration schemas
const TransformStepConfigSchema = z.object({
  source: z.object({
    type: z.enum(['database', 'api', 'file', 'stream', 'memory']),
    connectionString: z.string().optional(),
    endpoint: z.string().optional(),
    query: z.string().optional(),
    format: z.string().optional(),
  }),
  transformation: z.object({
    mapping: z.record(z.any()),
    validation: z.boolean(),
    enrichment: z.boolean(),
    deduplication: z.boolean().optional(),
  }),
  destination: z.object({
    type: z.enum(['database', 'api', 'file', 'stream', 'memory']),
    connectionString: z.string().optional(),
    table: z.string().optional(),
    format: z.string().optional(),
    upsertKey: z.string().optional(),
  }),
});

const ValidateStepConfigSchema = z.object({
  schema: z.object({
    type: z.enum(['zod', 'json-schema', 'avro', 'protobuf']),
    definition: z.any(),
    version: z.string().optional(),
  }),
  rules: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'regex']),
    value: z.any(),
    message: z.string().optional(),
  })),
  onInvalid: z.enum(['reject', 'quarantine', 'transform', 'ignore']),
  reporting: z.object({
    enabled: z.boolean(),
    destination: z.enum(['logs', 'metrics', 'alerts', 'database']),
    includeDetails: z.boolean(),
  }),
});

const EnrichStepConfigSchema = z.object({
  sources: z.array(z.object({
    type: z.enum(['api', 'database', 'calculation', 'lookup']),
    name: z.string(),
    config: z.record(z.any()),
  })),
  fields: z.array(z.string()),
  strategy: z.enum(['parallel', 'sequential', 'lazy']),
  cache: z.object({
    enabled: z.boolean(),
    ttl: z.number(),
    strategy: z.enum(['lru', 'fifo', 'lfu']),
    maxSize: z.number(),
  }),
});

const AggregateStepConfigSchema = z.object({
  groupBy: z.array(z.string()),
  metrics: z.array(z.object({
    name: z.string(),
    function: z.enum(['sum', 'avg', 'min', 'max', 'count', 'distinctCount', 'percentile']),
    field: z.string(),
    params: z.record(z.any()).optional(),
  })),
  window: z.object({
    type: z.enum(['tumbling', 'sliding', 'session']),
    size: z.number(),
    slide: z.number().optional(),
    gap: z.number().optional(),
  }),
  output: z.object({
    format: z.enum(['json', 'csv', 'parquet', 'avro']),
    destination: z.enum(['stream', 'file', 'database']),
    compression: z.boolean().optional(),
  }),
});

const DistributeStepConfigSchema = z.object({
  destinations: z.array(z.object({
    name: z.string(),
    type: z.enum(['database', 'queue', 'stream', 'webhook', 'file']),
    connection: z.string(),
    config: z.record(z.any()).optional(),
  })),
  routing: z.object({
    strategy: z.enum(['round-robin', 'hash', 'random', 'rules', 'all']),
    rules: z.array(z.object({
      condition: z.string(),
      destination: z.string(),
      priority: z.number().optional(),
    })).optional(),
    hashField: z.string().optional(),
  }),
  delivery: z.object({
    guarantees: z.enum(['at-most-once', 'at-least-once', 'exactly-once']),
    compression: z.boolean(),
    encryption: z.boolean().optional(),
    batchSize: z.number().optional(),
    maxRetries: z.number().optional(),
  }),
});

const MonitorStepConfigSchema = z.object({
  targets: z.array(z.object({
    name: z.string(),
    type: z.enum(['service', 'database', 'queue', 'metric']),
    connection: z.string(),
  })),
  checks: z.array(z.object({
    name: z.string(),
    type: z.enum(['http', 'tcp', 'query', 'metric']),
    config: z.record(z.any()),
    interval: z.number(),
    timeout: z.number(),
  })),
  alerting: z.object({
    enabled: z.boolean(),
    channels: z.array(z.string()),
    thresholds: z.record(z.any()),
    grouping: z.object({
      by: z.array(z.string()),
      window: z.number(),
      maxAlerts: z.number(),
    }).optional(),
  }),
});

const QueryStepConfigSchema = z.object({
  database: z.object({
    type: z.enum(['neo4j', 'postgres', 'mysql', 'mongodb', 'snowflake', 'bigquery']),
    connectionString: z.string(),
    poolSize: z.number().optional(),
  }),
  query: z.string().min(1),
  parameters: z.record(z.any()).optional(),
  resultFormat: z.enum(['json', 'csv', 'rows']),
  streaming: z.boolean().optional(),
});

const ComputeStepConfigSchema = z.object({
  algorithm: z.string().min(1),
  inputs: z.record(z.any()),
  outputs: z.record(z.any()),
  resources: z.object({
    cpu: z.number(),
    memory: z.string(),
    gpu: z.boolean().optional(),
    disk: z.string().optional(),
  }),
  optimization: z.object({
    parallelism: z.number(),
    vectorization: z.boolean(),
    caching: z.boolean(),
  }).optional(),
});

// Validation error types
export interface ValidationError {
  path: string;
  message: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: ValidationError[];
  suggestions?: string[];
}

export class WorkflowValidator {
  private stepConfigSchemas: Record<string, z.ZodSchema> = {
    transform: TransformStepConfigSchema,
    validate: ValidateStepConfigSchema,
    enrich: EnrichStepConfigSchema,
    aggregate: AggregateStepConfigSchema,
    distribute: DistributeStepConfigSchema,
    monitor: MonitorStepConfigSchema,
    query: QueryStepConfigSchema,
    compute: ComputeStepConfigSchema,
  };

  /**
   * Validate a complete workflow
   */
  async validate(workflow: any): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const suggestions: string[] = [];

    try {
      // Validate against base schema
      CompleteWorkflowSchema.parse(workflow);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(...this.zodErrorsToValidationErrors(error));
      }
    }

    // Validate each step configuration
    if (workflow.steps) {
      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        const stepErrors = await this.validateStep(step, i);
        errors.push(...stepErrors.errors || []);
        warnings.push(...stepErrors.warnings || []);
      }
    }

    // Check workflow consistency
    const consistencyErrors = this.checkWorkflowConsistency(workflow);
    errors.push(...consistencyErrors);

    // Generate suggestions
    suggestions.push(...this.generateSuggestions(workflow));

    // Check for security issues
    const securityIssues = this.checkSecurityIssues(workflow);
    warnings.push(...securityIssues);

    // Check performance considerations
    const performanceIssues = this.checkPerformanceIssues(workflow);
    warnings.push(...performanceIssues);

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * Validate a single workflow step
   */
  private async validateStep(step: WorkflowStep, index: number): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check if step type has a specific schema
    const schema = this.stepConfigSchemas[step.type];
    if (schema) {
      try {
        schema.parse(step.config);
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push(...this.zodErrorsToValidationErrors(error, `steps[${index}].config`));
        }
      }
    }

    // Check for empty config
    if (!step.config || Object.keys(step.config).length === 0) {
      errors.push({
        path: `steps[${index}].config`,
        message: 'Step configuration cannot be empty',
        code: 'EMPTY_CONFIG',
        severity: 'error',
      });
    }

    // Check authentication requirements
    if (this.stepRequiresAuth(step) && !step.authentication) {
      warnings.push({
        path: `steps[${index}].authentication`,
        message: 'This step type typically requires authentication',
        code: 'MISSING_AUTH',
        severity: 'warning',
      });
    }

    // Check performance settings
    if (!step.performance) {
      warnings.push({
        path: `steps[${index}].performance`,
        message: 'Consider adding performance configuration for optimal execution',
        code: 'MISSING_PERFORMANCE',
        severity: 'warning',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Check workflow consistency
   */
  private checkWorkflowConsistency(workflow: CompleteWorkflow): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check step dependencies
    workflow.steps.forEach((step, index) => {
      if (step.inputs) {
        step.inputs.forEach(input => {
          const inputStep = workflow.steps.find(s => s.outputs?.includes(input));
          if (!inputStep) {
            errors.push({
              path: `steps[${index}].inputs`,
              message: `Input "${input}" is not produced by any previous step`,
              code: 'MISSING_INPUT',
              severity: 'error',
            });
          }
        });
      }
    });

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(workflow.steps);
    if (circularDeps.length > 0) {
      errors.push({
        path: 'steps',
        message: `Circular dependencies detected: ${circularDeps.join(' -> ')}`,
        code: 'CIRCULAR_DEPENDENCY',
        severity: 'error',
      });
    }

    // Check trigger configuration
    if (workflow.trigger.type === 'schedule' && !workflow.trigger.config.cron) {
      errors.push({
        path: 'trigger.config.cron',
        message: 'Schedule trigger requires a cron expression',
        code: 'MISSING_CRON',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Check for security issues
   */
  private checkSecurityIssues(workflow: CompleteWorkflow): ValidationError[] {
    const warnings: ValidationError[] = [];

    workflow.steps.forEach((step, index) => {
      // Check for hardcoded credentials
      const configStr = JSON.stringify(step.config);
      if (configStr.match(/password|secret|key|token/i) && configStr.match(/["\'][\w\-]+["\']/)) {
        warnings.push({
          path: `steps[${index}].config`,
          message: 'Possible hardcoded credentials detected. Use environment variables instead.',
          code: 'HARDCODED_CREDENTIALS',
          severity: 'warning',
        });
      }

      // Check for unencrypted sensitive data transfer
      if (step.type === 'distribute' && !step.config.delivery?.encryption) {
        warnings.push({
          path: `steps[${index}].config.delivery.encryption`,
          message: 'Consider enabling encryption for data distribution',
          code: 'UNENCRYPTED_TRANSFER',
          severity: 'warning',
        });
      }
    });

    return warnings;
  }

  /**
   * Check for performance issues
   */
  private checkPerformanceIssues(workflow: CompleteWorkflow): ValidationError[] {
    const warnings: ValidationError[] = [];

    // Check for inefficient step ordering
    const aggregateIndex = workflow.steps.findIndex(s => s.type === 'aggregate');
    const enrichIndex = workflow.steps.findIndex(s => s.type === 'enrich');
    
    if (aggregateIndex > -1 && enrichIndex > -1 && enrichIndex < aggregateIndex) {
      warnings.push({
        path: 'steps',
        message: 'Consider aggregating before enrichment for better performance',
        code: 'INEFFICIENT_ORDERING',
        severity: 'warning',
      });
    }

    // Check for missing caching on expensive operations
    workflow.steps.forEach((step, index) => {
      if (['enrich', 'compute', 'query'].includes(step.type) && !step.performance?.caching?.enabled) {
        warnings.push({
          path: `steps[${index}].performance.caching`,
          message: `Consider enabling caching for ${step.type} operations`,
          code: 'MISSING_CACHE',
          severity: 'warning',
        });
      }
    });

    return warnings;
  }

  /**
   * Generate workflow suggestions
   */
  private generateSuggestions(workflow: CompleteWorkflow): string[] {
    const suggestions: string[] = [];

    // Suggest monitoring for long-running workflows
    if (workflow.metadata?.estimatedDuration && workflow.metadata.estimatedDuration > 300000) {
      suggestions.push('Consider adding monitoring steps for this long-running workflow');
    }

    // Suggest parallel processing
    const transformSteps = workflow.steps.filter(s => s.type === 'transform');
    if (transformSteps.length > 3) {
      suggestions.push('Multiple transform steps detected. Consider parallel processing for better performance.');
    }

    // Suggest error notifications
    const hasAlerts = workflow.steps.some(s => s.errorHandling?.alertOnError);
    if (!hasAlerts) {
      suggestions.push('Consider enabling error alerts for critical steps');
    }

    return suggestions;
  }

  /**
   * Detect circular dependencies in workflow steps
   */
  private detectCircularDependencies(steps: WorkflowStep[]): string[] {
    const graph: Map<string, string[]> = new Map();
    
    // Build dependency graph
    steps.forEach(step => {
      const deps: string[] = [];
      if (step.inputs) {
        steps.forEach(otherStep => {
          if (otherStep.outputs?.some(output => step.inputs?.includes(output))) {
            deps.push(otherStep.id);
          }
        });
      }
      graph.set(step.id, deps);
    });

    // DFS to detect cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycle: string[] = [];

    const hasCycle = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) {
            cycle.unshift(neighbor);
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          cycle.unshift(neighbor);
          cycle.unshift(node);
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const [node] of graph) {
      if (!visited.has(node) && hasCycle(node)) {
        return cycle;
      }
    }

    return [];
  }

  /**
   * Check if step requires authentication
   */
  private stepRequiresAuth(step: WorkflowStep): boolean {
    const authRequiredTypes = ['query', 'distribute', 'enrich'];
    const authRequiredConfigs = ['api', 'database', 'webhook'];
    
    return authRequiredTypes.includes(step.type) ||
           authRequiredConfigs.some(config => 
             JSON.stringify(step.config).toLowerCase().includes(config)
           );
  }

  /**
   * Convert Zod errors to validation errors
   */
  private zodErrorsToValidationErrors(
    zodError: z.ZodError,
    pathPrefix?: string
  ): ValidationError[] {
    return zodError.errors.map(err => ({
      path: pathPrefix ? `${pathPrefix}.${err.path.join('.')}` : err.path.join('.'),
      message: err.message,
      code: err.code,
      severity: 'error' as const,
    }));
  }

  /**
   * Get JSON Schema for workflow validation
   */
  getJsonSchema(): any {
    return zodToJsonSchema(CompleteWorkflowSchema);
  }

  /**
   * Get JSON Schema for specific step type
   */
  getStepJsonSchema(stepType: string): any {
    const schema = this.stepConfigSchemas[stepType];
    return schema ? zodToJsonSchema(schema) : null;
  }
}