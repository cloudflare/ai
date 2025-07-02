import { z } from 'zod';

// Extended workflow step types
export type WorkflowStepType = 
  | 'transform' 
  | 'validate' 
  | 'enrich' 
  | 'aggregate' 
  | 'distribute' 
  | 'monitor'
  | 'query'
  | 'compute';

// Error handling strategies
export type ErrorStrategy = 'retry' | 'fallback' | 'skip' | 'fail' | 'compensate';

// Authentication types
export type AuthType = 'api_key' | 'oauth2' | 'basic' | 'bearer' | 'custom';

// Cache strategies
export type CacheStrategy = 'lru' | 'fifo' | 'lfu';

// Delivery guarantees
export type DeliveryGuarantee = 'at-most-once' | 'at-least-once' | 'exactly-once';

// Workflow step interface
export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  name: string;
  description?: string;
  config: Record<string, any>;
  inputs?: string[];
  outputs?: string[];
  errorHandling?: ErrorHandling;
  performance?: PerformanceConfig;
  authentication?: AuthenticationConfig;
  monitoring?: MonitoringConfig;
}

// Error handling configuration
export interface ErrorHandling {
  strategy: ErrorStrategy;
  retryConfig?: RetryConfig;
  fallbackStep?: string;
  compensationStep?: string;
  alertOnError?: boolean;
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  backoffMultiplier: number;
  maxDelay: number;
  initialDelay: number;
}

// Performance configuration
export interface PerformanceConfig {
  timeout: number;
  concurrency: number;
  batchSize?: number;
  rateLimit?: RateLimit;
  caching?: CacheConfig;
}

// Rate limiting
export interface RateLimit {
  requests: number;
  window: number;
}

// Cache configuration
export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  strategy: CacheStrategy;
  maxSize: number;
}

// Authentication configuration
export interface AuthenticationConfig {
  type: AuthType;
  config: Record<string, any>;
}

// Monitoring configuration
export interface MonitoringConfig {
  metrics: string[];
  logging: LoggingConfig;
  tracing: boolean;
}

// Logging configuration
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  includePayload: boolean;
}

// Workflow trigger types
export type WorkflowTriggerType = 'schedule' | 'event' | 'webhook' | 'manual' | 'condition' | 'chain';

// Workflow trigger interface
export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  config: Record<string, any>;
}

// Schedule trigger config
export interface ScheduleTriggerConfig {
  cron: string;
  timezone: string;
  missedRunHandling?: 'skip' | 'run-once' | 'run-all';
}

// Event trigger config
export interface EventTriggerConfig {
  eventType: string;
  source: string;
  filters?: Record<string, any>;
  debounce?: number;
}

// Webhook trigger config
export interface WebhookTriggerConfig {
  method: 'GET' | 'POST' | 'PUT';
  authType: AuthType;
  validatePayload: boolean;
  responseTimeout: number;
  headers?: Record<string, string>;
}

// Condition trigger config
export interface ConditionTriggerConfig {
  expression: string;
  checkInterval: number;
  timeout: number;
  variables?: Record<string, any>;
}

// Chain trigger config
export interface ChainTriggerConfig {
  parentWorkflowId: string;
  waitForCompletion: boolean;
  inheritContext: boolean;
  contextMapping?: Record<string, string>;
}

// Step configuration types
export interface TransformStepConfig {
  source: DataSource;
  transformation: TransformationConfig;
  destination: DataDestination;
}

export interface DataSource {
  type: 'database' | 'api' | 'file' | 'stream' | 'memory';
  connectionString?: string;
  endpoint?: string;
  query?: string;
  format?: string;
}

export interface TransformationConfig {
  mapping: Record<string, any>;
  validation: boolean;
  enrichment: boolean;
  deduplication?: boolean;
}

export interface DataDestination {
  type: 'database' | 'api' | 'file' | 'stream' | 'memory';
  connectionString?: string;
  table?: string;
  format?: string;
  upsertKey?: string;
}

export interface ValidateStepConfig {
  schema: SchemaConfig;
  rules: ValidationRule[];
  onInvalid: 'reject' | 'quarantine' | 'transform' | 'ignore';
  reporting: ReportingConfig;
}

export interface SchemaConfig {
  type: 'zod' | 'json-schema' | 'avro' | 'protobuf';
  definition: any;
  version?: string;
}

export interface ValidationRule {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'regex';
  value: any;
  message?: string;
}

export interface ReportingConfig {
  enabled: boolean;
  destination: 'logs' | 'metrics' | 'alerts' | 'database';
  includeDetails: boolean;
}

export interface EnrichStepConfig {
  sources: EnrichmentSource[];
  fields: string[];
  strategy: 'parallel' | 'sequential' | 'lazy';
  cache: CacheConfig;
}

export interface EnrichmentSource {
  type: 'api' | 'database' | 'calculation' | 'lookup';
  name: string;
  config: Record<string, any>;
}

export interface AggregateStepConfig {
  groupBy: string[];
  metrics: AggregationMetric[];
  window: WindowConfig;
  output: OutputConfig;
}

export interface AggregationMetric {
  name: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinctCount' | 'percentile';
  field: string;
  params?: Record<string, any>;
}

export interface WindowConfig {
  type: 'tumbling' | 'sliding' | 'session';
  size: number;
  slide?: number;
  gap?: number;
}

export interface OutputConfig {
  format: 'json' | 'csv' | 'parquet' | 'avro';
  destination: 'stream' | 'file' | 'database';
  compression?: boolean;
}

export interface DistributeStepConfig {
  destinations: DistributionDestination[];
  routing: RoutingConfig;
  delivery: DeliveryConfig;
}

export interface DistributionDestination {
  name: string;
  type: 'database' | 'queue' | 'stream' | 'webhook' | 'file';
  connection: string;
  config?: Record<string, any>;
}

export interface RoutingConfig {
  strategy: 'round-robin' | 'hash' | 'random' | 'rules' | 'all';
  rules?: RoutingRule[];
  hashField?: string;
}

export interface RoutingRule {
  condition: string;
  destination: string;
  priority?: number;
}

export interface DeliveryConfig {
  guarantees: DeliveryGuarantee;
  compression: boolean;
  encryption?: boolean;
  batchSize?: number;
  maxRetries?: number;
}

export interface MonitorStepConfig {
  targets: MonitoringTarget[];
  checks: HealthCheck[];
  alerting: AlertingConfig;
}

export interface MonitoringTarget {
  name: string;
  type: 'service' | 'database' | 'queue' | 'metric';
  connection: string;
}

export interface HealthCheck {
  name: string;
  type: 'http' | 'tcp' | 'query' | 'metric';
  config: Record<string, any>;
  interval: number;
  timeout: number;
}

export interface AlertingConfig {
  enabled: boolean;
  channels: string[];
  thresholds: Record<string, any>;
  grouping?: AlertGrouping;
}

export interface AlertGrouping {
  by: string[];
  window: number;
  maxAlerts: number;
}

export interface QueryStepConfig {
  database: DatabaseConfig;
  query: string;
  parameters?: Record<string, any>;
  resultFormat: 'json' | 'csv' | 'rows';
  streaming?: boolean;
}

export interface DatabaseConfig {
  type: 'neo4j' | 'postgres' | 'mysql' | 'mongodb' | 'snowflake' | 'bigquery';
  connectionString: string;
  poolSize?: number;
}

export interface ComputeStepConfig {
  algorithm: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  resources: ResourceConfig;
  optimization?: OptimizationConfig;
}

export interface ResourceConfig {
  cpu: number;
  memory: string;
  gpu?: boolean;
  disk?: string;
}

export interface OptimizationConfig {
  parallelism: number;
  vectorization: boolean;
  caching: boolean;
}