// Core type definitions for the Restaurant Intelligence Platform

import { z } from 'zod';

// ==================== Base Types ====================
export type RestaurantPlatform = 'toast' | 'opentable' | '7shifts' | 'resy' | 'doordash' | 'uber_eats';

export type DataFormat = 'json' | 'csv' | 'xml' | 'yaml' | 'sql' | 'graphql' | 'cypher';

export type SchemaFormat = 'json-schema' | 'zod' | 'graphql' | 'pydantic' | 'typescript' | 'cypher';

// ==================== Restaurant Entities ====================
export const RestaurantEntitySchema = z.object({
  id: z.string(),
  externalId: z.string(),
  platform: z.enum(['toast', 'opentable', '7shifts', 'resy', 'doordash', 'uber_eats']),
  name: z.string(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string().default('USA'),
  }),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().email().optional(),
    website: z.string().url().optional(),
  }),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const MenuItemSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  platform: z.string(),
  name: z.string(),
  description: z.string().optional(),
  price: z.number(),
  category: z.string(),
  modifiers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  available: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
});

export const OrderSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  platform: z.string(),
  externalOrderId: z.string(),
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
  orderType: z.enum(['dine_in', 'takeout', 'delivery']),
  customer: z.object({
    id: z.string().optional(),
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  items: z.array(z.object({
    menuItemId: z.string(),
    name: z.string(),
    quantity: z.number(),
    price: z.number(),
    modifiers: z.array(z.any()).optional(),
  })),
  subtotal: z.number(),
  tax: z.number(),
  tip: z.number().optional(),
  total: z.number(),
  paymentMethod: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ReservationSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  platform: z.string(),
  externalReservationId: z.string(),
  status: z.enum(['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']),
  customer: z.object({
    id: z.string().optional(),
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  partySize: z.number(),
  dateTime: z.date(),
  tableIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const EmployeeSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  platform: z.string(),
  externalEmployeeId: z.string(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.string(),
  department: z.string().optional(),
  hourlyRate: z.number().optional(),
  status: z.enum(['active', 'inactive', 'terminated']),
  hireDate: z.date(),
  metadata: z.record(z.any()).optional(),
});

export const ShiftSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  platform: z.string(),
  employeeId: z.string(),
  startTime: z.date(),
  endTime: z.date(),
  role: z.string(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  actualStartTime: z.date().optional(),
  actualEndTime: z.date().optional(),
  breaks: z.array(z.object({
    startTime: z.date(),
    endTime: z.date(),
  })).optional(),
  notes: z.string().optional(),
});

// ==================== Analytics Types ====================
export const AnalyticsEventSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  eventType: z.string(),
  category: z.enum(['sales', 'operations', 'customer', 'employee', 'inventory']),
  data: z.record(z.any()),
  timestamp: z.date(),
  metadata: z.object({
    source: z.string(),
    version: z.string().optional(),
    processingTime: z.number().optional(),
  }),
});

export const MetricSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  metricType: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  period: z.object({
    start: z.date(),
    end: z.date(),
  }),
  dimensions: z.record(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

// ==================== Knowledge Graph Types ====================
export const GraphNodeSchema = z.object({
  id: z.string(),
  labels: z.array(z.string()),
  properties: z.record(z.any()),
  embeddings: z.array(z.number()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const GraphRelationshipSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  type: z.string(),
  properties: z.record(z.any()),
  weight: z.number().default(1),
  direction: z.enum(['directed', 'undirected']).default('directed'),
  createdAt: z.date(),
});

export const HypergraphEdgeSchema = z.object({
  id: z.string(),
  nodeIds: z.array(z.string()).min(2),
  type: z.string(),
  properties: z.record(z.any()),
  weight: z.number().default(1),
  createdAt: z.date(),
});

// ==================== Workflow Types ====================
export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  trigger: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('schedule'),
      schedule: z.string(), // cron expression
    }),
    z.object({
      type: z.literal('event'),
      eventType: z.string(),
      filters: z.record(z.any()).optional(),
    }),
    z.object({
      type: z.literal('webhook'),
      webhookId: z.string(),
    }),
    z.object({
      type: z.literal('manual'),
    }),
  ]),
  steps: z.array(z.object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.any()),
    retryPolicy: z.object({
      maxRetries: z.number().default(3),
      backoffMultiplier: z.number().default(2),
      initialDelay: z.number().default(1000),
    }).optional(),
  })),
  status: z.enum(['active', 'inactive', 'draft']),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const WorkflowExecutionSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  startTime: z.date(),
  endTime: z.date().optional(),
  steps: z.array(z.object({
    stepId: z.string(),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'skipped']),
    startTime: z.date().optional(),
    endTime: z.date().optional(),
    output: z.any().optional(),
    error: z.string().optional(),
  })),
  context: z.record(z.any()),
  result: z.any().optional(),
  error: z.string().optional(),
});

// ==================== Schema Transformation Types ====================
export const SchemaTransformationRequestSchema = z.object({
  sourceFormat: z.enum(['json-schema', 'zod', 'graphql', 'pydantic', 'typescript', 'cypher']),
  targetFormat: z.enum(['json-schema', 'zod', 'graphql', 'pydantic', 'typescript', 'cypher']),
  schema: z.string(),
  options: z.object({
    validateSchema: z.boolean().default(true),
    preserveComments: z.boolean().default(true),
    formatting: z.object({
      indent: z.number().default(2),
      lineWidth: z.number().default(80),
    }).optional(),
    namingConvention: z.enum(['camelCase', 'snake_case', 'PascalCase']).optional(),
  }).optional(),
});

// ==================== Integration Types ====================
export const IntegrationConfigSchema = z.object({
  id: z.string(),
  platform: z.enum(['toast', 'opentable', '7shifts', 'resy', 'doordash', 'uber_eats']),
  restaurantId: z.string(),
  credentials: z.object({
    apiKey: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
  }),
  config: z.object({
    baseUrl: z.string().optional(),
    webhookUrl: z.string().optional(),
    syncInterval: z.number().default(300000), // 5 minutes
    enabledFeatures: z.array(z.string()).optional(),
  }),
  status: z.enum(['active', 'inactive', 'error']),
  lastSync: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

// ==================== Alert Types ====================
export const AlertSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  type: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string(),
  description: z.string(),
  source: z.string(),
  data: z.record(z.any()).optional(),
  status: z.enum(['active', 'acknowledged', 'resolved', 'dismissed']),
  createdAt: z.date(),
  acknowledgedAt: z.date().optional(),
  resolvedAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

// Type exports
export type RestaurantEntity = z.infer<typeof RestaurantEntitySchema>;
export type MenuItem = z.infer<typeof MenuItemSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type Employee = z.infer<typeof EmployeeSchema>;
export type Shift = z.infer<typeof ShiftSchema>;
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphRelationship = z.infer<typeof GraphRelationshipSchema>;
export type HypergraphEdge = z.infer<typeof HypergraphEdgeSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
export type SchemaTransformationRequest = z.infer<typeof SchemaTransformationRequestSchema>;
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;
export type Alert = z.infer<typeof AlertSchema>;