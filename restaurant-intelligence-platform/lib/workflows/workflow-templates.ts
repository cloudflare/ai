import { CompleteWorkflow } from './ai-workflow-generator';
import { v4 as uuidv4 } from 'uuid';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'etl' | 'analytics' | 'integration' | 'monitoring' | 'optimization';
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  estimatedSetupTime: number; // minutes
  requiredIntegrations: string[];
  workflow: Partial<CompleteWorkflow>;
}

export class WorkflowTemplates {
  private templates: Map<string, WorkflowTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates() {
    // Restaurant Data ETL Pipeline
    this.templates.set('restaurant-etl-complete', {
      id: 'restaurant-etl-complete',
      name: 'Complete Restaurant ETL Pipeline',
      description: 'Extract, transform, and load data from multiple restaurant platforms with full error handling and monitoring',
      category: 'etl',
      tags: ['toast', 'opentable', '7shifts', 'etl', 'data-pipeline'],
      difficulty: 'intermediate',
      estimatedSetupTime: 30,
      requiredIntegrations: ['toast', 'opentable', '7shifts', 'neo4j', 'snowflake'],
      workflow: {
        name: 'Restaurant Multi-Platform ETL',
        description: 'Comprehensive ETL pipeline for restaurant data consolidation',
        trigger: {
          type: 'schedule',
          config: {
            cron: '0 */15 * * *',
            timezone: 'America/New_York',
            missedRunHandling: 'run-once',
          },
        },
        steps: [
          {
            id: 'extract-toast',
            type: 'query',
            name: 'Extract Toast POS Data',
            config: {
              database: {
                type: 'api',
                connectionString: '${env.TOAST_API_URL}',
                poolSize: 5,
              },
              query: JSON.stringify({
                endpoints: [
                  '/orders?startDate=${context.startDate}&endDate=${context.endDate}',
                  '/menu/items',
                  '/employees',
                  '/shifts?date=${context.date}',
                ],
              }),
              parameters: {
                headers: {
                  'Authorization': 'Bearer ${env.TOAST_API_KEY}',
                  'Restaurant-ID': '${env.TOAST_RESTAURANT_ID}',
                },
              },
              resultFormat: 'json',
              streaming: true,
            },
            outputs: ['toast_raw_data'],
            errorHandling: {
              strategy: 'retry',
              retryConfig: {
                maxAttempts: 3,
                backoffMultiplier: 2,
                maxDelay: 30000,
                initialDelay: 1000,
              },
              alertOnError: true,
            },
            performance: {
              timeout: 120000,
              concurrency: 3,
              rateLimit: {
                requests: 100,
                window: 60000,
              },
              caching: {
                enabled: true,
                ttl: 300000,
                strategy: 'lru',
                maxSize: 1000,
              },
            },
            authentication: {
              type: 'bearer',
              config: {
                token: '${env.TOAST_API_KEY}',
                refreshUrl: '${env.TOAST_TOKEN_REFRESH_URL}',
              },
            },
          },
          {
            id: 'extract-opentable',
            type: 'query',
            name: 'Extract OpenTable Reservations',
            config: {
              database: {
                type: 'api',
                connectionString: '${env.OPENTABLE_API_URL}',
              },
              query: JSON.stringify({
                graphql: `
                  query GetReservations($startDate: DateTime!, $endDate: DateTime!) {
                    reservations(startDate: $startDate, endDate: $endDate) {
                      id
                      customerName
                      partySize
                      dateTime
                      status
                      table {
                        id
                        number
                        capacity
                      }
                    }
                  }
                `,
              }),
              parameters: {
                startDate: '${context.startDate}',
                endDate: '${context.endDate}',
              },
              resultFormat: 'json',
            },
            outputs: ['opentable_raw_data'],
            errorHandling: {
              strategy: 'retry',
              retryConfig: {
                maxAttempts: 3,
                backoffMultiplier: 2,
                maxDelay: 30000,
                initialDelay: 1000,
              },
            },
            performance: {
              timeout: 60000,
              concurrency: 1,
              rateLimit: {
                requests: 50,
                window: 60000,
              },
            },
            authentication: {
              type: 'oauth2',
              config: {
                clientId: '${env.OPENTABLE_CLIENT_ID}',
                clientSecret: '${env.OPENTABLE_CLIENT_SECRET}',
                tokenUrl: '${env.OPENTABLE_TOKEN_URL}',
                scope: 'reservations.read',
              },
            },
          },
          {
            id: 'extract-7shifts',
            type: 'query',
            name: 'Extract 7shifts Staff Data',
            config: {
              database: {
                type: 'api',
                connectionString: '${env.SEVENSHIFTS_API_URL}',
              },
              query: JSON.stringify({
                endpoints: [
                  '/users',
                  '/shifts?start=${context.startDate}&end=${context.endDate}',
                  '/time_punches?start=${context.startDate}&end=${context.endDate}',
                ],
              }),
              resultFormat: 'json',
            },
            outputs: ['sevenshifts_raw_data'],
            errorHandling: {
              strategy: 'retry',
              retryConfig: {
                maxAttempts: 3,
                backoffMultiplier: 2,
                maxDelay: 30000,
                initialDelay: 1000,
              },
            },
            performance: {
              timeout: 60000,
              concurrency: 2,
              rateLimit: {
                requests: 60,
                window: 60000,
              },
            },
            authentication: {
              type: 'api_key',
              config: {
                key: '${env.SEVENSHIFTS_API_KEY}',
                header: 'x-api-key',
              },
            },
          },
          {
            id: 'validate-data',
            type: 'validate',
            name: 'Validate Extracted Data',
            inputs: ['toast_raw_data', 'opentable_raw_data', 'sevenshifts_raw_data'],
            config: {
              schema: {
                type: 'zod',
                definition: {
                  toast: {
                    orders: 'z.array(OrderSchema)',
                    menu: 'z.array(MenuItemSchema)',
                    employees: 'z.array(EmployeeSchema)',
                  },
                  opentable: {
                    reservations: 'z.array(ReservationSchema)',
                  },
                  sevenshifts: {
                    users: 'z.array(EmployeeSchema)',
                    shifts: 'z.array(ShiftSchema)',
                  },
                },
              },
              rules: [
                {
                  field: 'orders.*.total',
                  operator: 'gte',
                  value: 0,
                  message: 'Order total must be non-negative',
                },
                {
                  field: 'reservations.*.partySize',
                  operator: 'gte',
                  value: 1,
                  message: 'Party size must be at least 1',
                },
              ],
              onInvalid: 'quarantine',
              reporting: {
                enabled: true,
                destination: 'metrics',
                includeDetails: true,
              },
            },
            outputs: ['validated_data'],
            errorHandling: {
              strategy: 'skip',
              alertOnError: true,
            },
            performance: {
              timeout: 30000,
              concurrency: 5,
            },
          },
          {
            id: 'transform-canonical',
            type: 'transform',
            name: 'Transform to Canonical Format',
            inputs: ['validated_data'],
            config: {
              source: {
                type: 'memory',
                format: 'json',
              },
              transformation: {
                mapping: {
                  orders: {
                    id: 'generateUUID()',
                    externalId: 'id',
                    platform: '"toast"',
                    restaurantId: '${env.RESTAURANT_ID}',
                    status: 'mapOrderStatus(state)',
                    orderType: 'mapOrderType(diningOption)',
                    customer: {
                      name: 'customer.displayName',
                      email: 'customer.email',
                      phone: 'customer.phone',
                    },
                    items: 'transformOrderItems(items)',
                    subtotal: 'amounts.subtotal / 100',
                    tax: 'amounts.tax / 100',
                    tip: 'amounts.tip / 100',
                    total: 'amounts.total / 100',
                    createdAt: 'createdDate',
                  },
                  reservations: {
                    id: 'generateUUID()',
                    externalId: 'id',
                    platform: '"opentable"',
                    restaurantId: '${env.RESTAURANT_ID}',
                    customer: {
                      name: 'customerName',
                    },
                    partySize: 'partySize',
                    dateTime: 'dateTime',
                    status: 'toLowerCase(status)',
                  },
                  employees: {
                    id: 'generateUUID()',
                    externalId: 'id',
                    platform: 'platform',
                    restaurantId: '${env.RESTAURANT_ID}',
                    name: 'fullName || firstName + " " + lastName',
                    email: 'email',
                    role: 'role.name',
                    department: 'department.name',
                    status: 'active ? "active" : "inactive"',
                  },
                },
                validation: true,
                enrichment: true,
                deduplication: true,
              },
              destination: {
                type: 'memory',
                format: 'canonical',
              },
            },
            outputs: ['canonical_data'],
            errorHandling: {
              strategy: 'fallback',
              fallbackStep: 'load-raw',
            },
            performance: {
              timeout: 60000,
              concurrency: 3,
              batchSize: 1000,
            },
          },
          {
            id: 'enrich-analytics',
            type: 'enrich',
            name: 'Enrich with Analytics Data',
            inputs: ['canonical_data'],
            config: {
              sources: [
                {
                  type: 'calculation',
                  name: 'orderMetrics',
                  config: {
                    calculations: [
                      {
                        name: 'dayOfWeek',
                        formula: 'getDayOfWeek(createdAt)',
                      },
                      {
                        name: 'hourOfDay',
                        formula: 'getHourOfDay(createdAt)',
                      },
                      {
                        name: 'isWeekend',
                        formula: 'dayOfWeek in [0, 6]',
                      },
                      {
                        name: 'isPeakHour',
                        formula: 'hourOfDay in [12, 13, 18, 19, 20]',
                      },
                    ],
                  },
                },
                {
                  type: 'lookup',
                  name: 'customerSegment',
                  config: {
                    source: 'neo4j',
                    query: 'MATCH (c:Customer {email: $email}) RETURN c.segment as segment, c.lifetime_value as ltv',
                    cache: true,
                  },
                },
                {
                  type: 'api',
                  name: 'weatherData',
                  config: {
                    endpoint: 'https://api.weather.com/v1/location/${location}/weather',
                    params: {
                      date: '${createdAt}',
                    },
                    transform: {
                      temperature: 'main.temp',
                      condition: 'weather[0].main',
                    },
                  },
                },
              ],
              fields: ['orderMetrics', 'customerSegment', 'weatherData'],
              strategy: 'parallel',
              cache: {
                enabled: true,
                ttl: 3600000,
                strategy: 'lru',
                maxSize: 10000,
              },
            },
            outputs: ['enriched_data'],
            errorHandling: {
              strategy: 'skip',
            },
            performance: {
              timeout: 45000,
              concurrency: 10,
              rateLimit: {
                requests: 100,
                window: 60000,
              },
            },
          },
          {
            id: 'aggregate-metrics',
            type: 'aggregate',
            name: 'Calculate Aggregate Metrics',
            inputs: ['enriched_data'],
            config: {
              groupBy: ['platform', 'dayOfWeek', 'hourOfDay'],
              metrics: [
                {
                  name: 'orderCount',
                  function: 'count',
                  field: 'id',
                },
                {
                  name: 'totalRevenue',
                  function: 'sum',
                  field: 'total',
                },
                {
                  name: 'avgOrderValue',
                  function: 'avg',
                  field: 'total',
                },
                {
                  name: 'maxOrderValue',
                  function: 'max',
                  field: 'total',
                },
                {
                  name: 'uniqueCustomers',
                  function: 'distinctCount',
                  field: 'customer.email',
                },
              ],
              window: {
                type: 'tumbling',
                size: 3600000, // 1 hour
              },
              output: {
                format: 'json',
                destination: 'stream',
                compression: true,
              },
            },
            outputs: ['aggregated_metrics'],
            performance: {
              timeout: 30000,
              concurrency: 1,
            },
          },
          {
            id: 'load-neo4j',
            type: 'distribute',
            name: 'Load to Neo4j Knowledge Graph',
            inputs: ['enriched_data'],
            config: {
              destinations: [
                {
                  name: 'neo4j-primary',
                  type: 'database',
                  connection: '${env.NEO4J_URI}',
                  config: {
                    database: 'restaurant',
                    writeMode: 'merge',
                    cypher: {
                      orders: `
                        MERGE (o:Order {id: $id})
                        SET o += $properties
                        MERGE (c:Customer {email: $customer.email})
                        SET c.name = $customer.name
                        MERGE (o)-[:PLACED_BY]->(c)
                        MERGE (r:Restaurant {id: $restaurantId})
                        MERGE (o)-[:PLACED_AT]->(r)
                      `,
                      employees: `
                        MERGE (e:Employee {id: $id})
                        SET e += $properties
                        MERGE (r:Restaurant {id: $restaurantId})
                        MERGE (e)-[:WORKS_AT]->(r)
                      `,
                    },
                  },
                },
              ],
              routing: {
                strategy: 'all',
              },
              delivery: {
                guarantees: 'exactly-once',
                compression: true,
                batchSize: 500,
                maxRetries: 5,
              },
            },
            errorHandling: {
              strategy: 'retry',
              retryConfig: {
                maxAttempts: 5,
                backoffMultiplier: 3,
                maxDelay: 60000,
                initialDelay: 2000,
              },
            },
            performance: {
              timeout: 180000,
              concurrency: 2,
            },
            authentication: {
              type: 'basic',
              config: {
                username: '${env.NEO4J_USERNAME}',
                password: '${env.NEO4J_PASSWORD}',
              },
            },
          },
          {
            id: 'load-snowflake',
            type: 'distribute',
            name: 'Load to Snowflake Data Warehouse',
            inputs: ['enriched_data', 'aggregated_metrics'],
            config: {
              destinations: [
                {
                  name: 'snowflake-warehouse',
                  type: 'database',
                  connection: '${env.SNOWFLAKE_CONNECTION}',
                  config: {
                    warehouse: 'COMPUTE_WH',
                    database: 'RESTAURANT_DATA',
                    schema: 'PUBLIC',
                    tables: {
                      orders: 'FACT_ORDERS',
                      reservations: 'FACT_RESERVATIONS',
                      employees: 'DIM_EMPLOYEES',
                      metrics: 'AGG_HOURLY_METRICS',
                    },
                    stagingArea: 'RESTAURANT_STAGE',
                    fileFormat: 'PARQUET',
                  },
                },
              ],
              routing: {
                strategy: 'all',
              },
              delivery: {
                guarantees: 'exactly-once',
                compression: true,
                encryption: true,
                batchSize: 10000,
              },
            },
            errorHandling: {
              strategy: 'retry',
              retryConfig: {
                maxAttempts: 3,
                backoffMultiplier: 2,
                maxDelay: 120000,
                initialDelay: 5000,
              },
            },
            performance: {
              timeout: 300000,
              concurrency: 1,
            },
          },
          {
            id: 'monitor-pipeline',
            type: 'monitor',
            name: 'Monitor Pipeline Health',
            config: {
              targets: [
                {
                  name: 'neo4j-health',
                  type: 'database',
                  connection: '${env.NEO4J_URI}',
                },
                {
                  name: 'snowflake-health',
                  type: 'database',
                  connection: '${env.SNOWFLAKE_CONNECTION}',
                },
                {
                  name: 'api-health',
                  type: 'service',
                  connection: 'https://api-health.restaurant.com',
                },
              ],
              checks: [
                {
                  name: 'neo4j-connectivity',
                  type: 'query',
                  config: {
                    query: 'RETURN 1',
                    expectedResult: 1,
                  },
                  interval: 60000,
                  timeout: 5000,
                },
                {
                  name: 'data-freshness',
                  type: 'query',
                  config: {
                    query: 'MATCH (o:Order) RETURN max(o.createdAt) as latest',
                    maxAge: 3600000, // 1 hour
                  },
                  interval: 300000,
                  timeout: 10000,
                },
                {
                  name: 'error-rate',
                  type: 'metric',
                  config: {
                    metric: 'pipeline.errors',
                    threshold: 0.05, // 5% error rate
                    window: 3600000,
                  },
                  interval: 60000,
                  timeout: 5000,
                },
              ],
              alerting: {
                enabled: true,
                channels: ['email', 'slack', 'pagerduty'],
                thresholds: {
                  critical: {
                    errorRate: 0.1,
                    latency: 300000,
                    availability: 0.95,
                  },
                  warning: {
                    errorRate: 0.05,
                    latency: 120000,
                    availability: 0.98,
                  },
                },
                grouping: {
                  by: ['target', 'check'],
                  window: 300000,
                  maxAlerts: 5,
                },
              },
            },
            performance: {
              timeout: 15000,
              concurrency: 5,
            },
            monitoring: {
              metrics: ['availability', 'latency', 'error_rate', 'throughput'],
              logging: {
                level: 'info',
                includePayload: false,
              },
              tracing: true,
            },
          },
        ],
        status: 'draft',
        metadata: {
          version: '1.0.0',
          author: 'Workflow Templates',
          tags: ['etl', 'restaurant', 'complete'],
          estimatedDuration: 600000,
          complexity: 'high',
          requiredPermissions: [
            'toast:read',
            'opentable:read',
            '7shifts:read',
            'neo4j:write',
            'snowflake:write',
          ],
        },
      },
    });

    // Real-time Order Analytics
    this.templates.set('realtime-order-analytics', {
      id: 'realtime-order-analytics',
      name: 'Real-time Order Analytics',
      description: 'Process and analyze restaurant orders in real-time with anomaly detection',
      category: 'analytics',
      tags: ['analytics', 'real-time', 'orders', 'anomaly-detection'],
      difficulty: 'advanced',
      estimatedSetupTime: 45,
      requiredIntegrations: ['toast', 'neo4j', 'redis'],
      workflow: {
        name: 'Real-time Order Analytics Pipeline',
        description: 'Stream processing for live order analytics and anomaly detection',
        trigger: {
          type: 'event',
          config: {
            eventType: 'order.created',
            source: 'webhook',
            filters: {
              status: ['confirmed', 'preparing'],
            },
            debounce: 1000,
          },
        },
        steps: [
          {
            id: 'validate-order',
            type: 'validate',
            name: 'Validate Order Event',
            config: {
              schema: {
                type: 'zod',
                definition: {
                  orderId: 'z.string().uuid()',
                  restaurantId: 'z.string()',
                  timestamp: 'z.string().datetime()',
                  total: 'z.number().positive()',
                  items: 'z.array(z.object({ id: z.string(), quantity: z.number() }))',
                },
              },
              rules: [
                {
                  field: 'total',
                  operator: 'lte',
                  value: 10000,
                  message: 'Order total exceeds maximum allowed',
                },
              ],
              onInvalid: 'reject',
              reporting: {
                enabled: true,
                destination: 'alerts',
                includeDetails: true,
              },
            },
            performance: {
              timeout: 5000,
              concurrency: 10,
            },
          },
          {
            id: 'enrich-context',
            type: 'enrich',
            name: 'Enrich Order Context',
            config: {
              sources: [
                {
                  type: 'lookup',
                  name: 'customerHistory',
                  config: {
                    source: 'redis',
                    key: 'customer:${customerId}:history',
                    ttl: 3600000,
                  },
                },
                {
                  type: 'calculation',
                  name: 'orderMetrics',
                  config: {
                    calculations: [
                      {
                        name: 'itemCount',
                        formula: 'items.length',
                      },
                      {
                        name: 'avgItemPrice',
                        formula: 'total / itemCount',
                      },
                    ],
                  },
                },
              ],
              fields: ['customerHistory', 'orderMetrics'],
              strategy: 'parallel',
              cache: {
                enabled: true,
                ttl: 60000,
                strategy: 'lru',
                maxSize: 5000,
              },
            },
            performance: {
              timeout: 10000,
              concurrency: 5,
            },
          },
          {
            id: 'detect-anomalies',
            type: 'compute',
            name: 'Anomaly Detection',
            config: {
              algorithm: 'isolation-forest',
              inputs: {
                features: ['total', 'itemCount', 'avgItemPrice', 'hourOfDay', 'dayOfWeek'],
                historicalData: 'customerHistory',
              },
              outputs: {
                anomalyScore: 'float',
                isAnomaly: 'boolean',
                anomalyType: 'string',
              },
              resources: {
                cpu: 2,
                memory: '2Gi',
              },
              optimization: {
                parallelism: 4,
                vectorization: true,
                caching: true,
              },
            },
            errorHandling: {
              strategy: 'fallback',
              fallbackStep: 'simple-threshold-check',
            },
            performance: {
              timeout: 15000,
              concurrency: 3,
            },
          },
          {
            id: 'update-metrics',
            type: 'aggregate',
            name: 'Update Real-time Metrics',
            config: {
              groupBy: ['restaurantId', 'hourOfDay'],
              metrics: [
                {
                  name: 'orderCount',
                  function: 'count',
                  field: 'orderId',
                },
                {
                  name: 'revenue',
                  function: 'sum',
                  field: 'total',
                },
                {
                  name: 'avgOrderValue',
                  function: 'avg',
                  field: 'total',
                },
                {
                  name: 'anomalyRate',
                  function: 'avg',
                  field: 'isAnomaly',
                },
              ],
              window: {
                type: 'sliding',
                size: 3600000,
                slide: 60000,
              },
              output: {
                format: 'json',
                destination: 'stream',
              },
            },
            performance: {
              timeout: 10000,
              concurrency: 1,
            },
          },
          {
            id: 'alert-on-anomaly',
            type: 'distribute',
            name: 'Send Anomaly Alerts',
            config: {
              destinations: [
                {
                  name: 'slack-alerts',
                  type: 'webhook',
                  connection: '${env.SLACK_WEBHOOK_URL}',
                  config: {
                    condition: 'isAnomaly === true',
                    template: {
                      text: 'Anomaly detected in order ${orderId}',
                      attachments: [{
                        color: 'warning',
                        fields: [
                          { title: 'Order ID', value: '${orderId}' },
                          { title: 'Total', value: '$${total}' },
                          { title: 'Anomaly Score', value: '${anomalyScore}' },
                        ],
                      }],
                    },
                  },
                },
                {
                  name: 'metrics-dashboard',
                  type: 'stream',
                  connection: 'redis://metrics-stream',
                  config: {
                    channel: 'order-analytics',
                    format: 'json',
                  },
                },
              ],
              routing: {
                strategy: 'rules',
                rules: [
                  {
                    condition: 'isAnomaly === true',
                    destination: 'slack-alerts',
                    priority: 1,
                  },
                  {
                    condition: 'true',
                    destination: 'metrics-dashboard',
                    priority: 2,
                  },
                ],
              },
              delivery: {
                guarantees: 'at-least-once',
                compression: false,
              },
            },
            performance: {
              timeout: 5000,
              concurrency: 5,
            },
          },
        ],
        status: 'draft',
        metadata: {
          version: '1.0.0',
          tags: ['real-time', 'analytics', 'anomaly-detection'],
          estimatedDuration: 30000,
          complexity: 'high',
        },
      },
    });

    // Staff Optimization Workflow
    this.templates.set('staff-optimization', {
      id: 'staff-optimization',
      name: 'Staff Schedule Optimization',
      description: 'Optimize staff scheduling based on predicted demand and employee preferences',
      category: 'optimization',
      tags: ['scheduling', 'optimization', 'ai', 'predictive'],
      difficulty: 'expert',
      estimatedSetupTime: 60,
      requiredIntegrations: ['7shifts', 'toast', 'weather-api'],
      workflow: {
        name: 'AI-Powered Staff Optimization',
        description: 'Use ML to predict demand and optimize staff schedules',
        trigger: {
          type: 'schedule',
          config: {
            cron: '0 2 * * 1', // Every Monday at 2 AM
            timezone: 'America/New_York',
          },
        },
        steps: [
          {
            id: 'gather-historical-data',
            type: 'query',
            name: 'Gather Historical Data',
            config: {
              database: {
                type: 'snowflake',
                connectionString: '${env.SNOWFLAKE_CONNECTION}',
              },
              query: `
                SELECT 
                  date,
                  hour,
                  day_of_week,
                  total_orders,
                  total_revenue,
                  avg_wait_time,
                  staff_count,
                  weather_condition
                FROM restaurant_metrics
                WHERE date >= DATEADD('day', -90, CURRENT_DATE())
              `,
              resultFormat: 'json',
            },
            outputs: ['historical_data'],
            performance: {
              timeout: 120000,
              concurrency: 1,
            },
          },
          {
            id: 'predict-demand',
            type: 'compute',
            name: 'Predict Weekly Demand',
            inputs: ['historical_data'],
            config: {
              algorithm: 'prophet-forecasting',
              inputs: {
                historicalData: '${historical_data}',
                features: ['day_of_week', 'hour', 'weather_condition', 'is_holiday'],
                targetVariable: 'total_orders',
                forecastHorizon: 168, // hours in a week
              },
              outputs: {
                predictions: 'array<{timestamp, predicted_orders, confidence_interval}>',
                model_metrics: 'object',
              },
              resources: {
                cpu: 4,
                memory: '8Gi',
                gpu: true,
              },
            },
            errorHandling: {
              strategy: 'fallback',
              fallbackStep: 'use-average-demand',
            },
            performance: {
              timeout: 300000,
              concurrency: 1,
            },
          },
          {
            id: 'get-staff-preferences',
            type: 'query',
            name: 'Get Staff Availability and Preferences',
            config: {
              database: {
                type: 'api',
                connectionString: '${env.SEVENSHIFTS_API_URL}',
              },
              query: JSON.stringify({
                endpoints: [
                  '/users?include=availability,preferences',
                  '/time_off_requests?status=approved&start=${nextWeekStart}&end=${nextWeekEnd}',
                ],
              }),
              resultFormat: 'json',
            },
            outputs: ['staff_data'],
            performance: {
              timeout: 60000,
              concurrency: 2,
            },
          },
          {
            id: 'optimize-schedule',
            type: 'compute',
            name: 'Optimize Staff Schedule',
            inputs: ['predictions', 'staff_data'],
            config: {
              algorithm: 'constraint-programming',
              inputs: {
                demandForecast: '${predictions}',
                staffAvailability: '${staff_data.availability}',
                staffPreferences: '${staff_data.preferences}',
                constraints: {
                  minStaffPerHour: 3,
                  maxShiftLength: 8,
                  minShiftLength: 4,
                  maxHoursPerWeek: 40,
                  minRestBetweenShifts: 8,
                },
                objectives: {
                  minimizeLaborCost: 0.4,
                  maximizePreferenceSatisfaction: 0.3,
                  minimizeUnderstaffing: 0.3,
                },
              },
              outputs: {
                optimizedSchedule: 'array<{employeeId, shifts}>',
                metrics: {
                  laborCost: 'number',
                  preferenceSatisfaction: 'number',
                  coverageScore: 'number',
                },
              },
              resources: {
                cpu: 8,
                memory: '16Gi',
              },
              optimization: {
                parallelism: 8,
                vectorization: true,
                caching: false,
              },
            },
            performance: {
              timeout: 600000, // 10 minutes
              concurrency: 1,
            },
          },
          {
            id: 'validate-schedule',
            type: 'validate',
            name: 'Validate Optimized Schedule',
            inputs: ['optimizedSchedule'],
            config: {
              schema: {
                type: 'custom',
                definition: 'ScheduleValidationSchema',
              },
              rules: [
                {
                  field: 'shifts.*.duration',
                  operator: 'lte',
                  value: 8,
                  message: 'Shift exceeds maximum duration',
                },
                {
                  field: 'weeklyHours.*',
                  operator: 'lte',
                  value: 40,
                  message: 'Employee scheduled for more than 40 hours',
                },
              ],
              onInvalid: 'transform',
              reporting: {
                enabled: true,
                destination: 'logs',
                includeDetails: true,
              },
            },
            outputs: ['validated_schedule'],
            performance: {
              timeout: 30000,
              concurrency: 1,
            },
          },
          {
            id: 'publish-schedule',
            type: 'distribute',
            name: 'Publish Schedule to Systems',
            inputs: ['validated_schedule'],
            config: {
              destinations: [
                {
                  name: '7shifts',
                  type: 'api',
                  connection: '${env.SEVENSHIFTS_API_URL}',
                  config: {
                    endpoint: '/schedules',
                    method: 'POST',
                    transform: 'map7ShiftsFormat',
                  },
                },
                {
                  name: 'notification-service',
                  type: 'queue',
                  connection: '${env.NOTIFICATION_QUEUE}',
                  config: {
                    queue: 'schedule-notifications',
                    priority: 'high',
                  },
                },
              ],
              routing: {
                strategy: 'all',
              },
              delivery: {
                guarantees: 'exactly-once',
                compression: false,
              },
            },
            errorHandling: {
              strategy: 'compensate',
              compensationStep: 'rollback-schedule',
            },
            performance: {
              timeout: 60000,
              concurrency: 2,
            },
          },
        ],
        status: 'draft',
        metadata: {
          version: '1.0.0',
          tags: ['optimization', 'ai', 'scheduling'],
          estimatedDuration: 900000, // 15 minutes
          complexity: 'extreme',
        },
      },
    });

    // Simple Data Sync Template
    this.templates.set('simple-data-sync', {
      id: 'simple-data-sync',
      name: 'Simple Data Sync',
      description: 'Basic template for syncing data between two systems',
      category: 'integration',
      tags: ['sync', 'integration', 'basic'],
      difficulty: 'beginner',
      estimatedSetupTime: 10,
      requiredIntegrations: [],
      workflow: {
        name: 'Basic Data Sync',
        description: 'Sync data from source to destination with basic error handling',
        trigger: {
          type: 'schedule',
          config: {
            cron: '0 * * * *', // Every hour
            timezone: 'UTC',
          },
        },
        steps: [
          {
            id: 'extract',
            type: 'query',
            name: 'Extract Source Data',
            config: {
              database: {
                type: 'postgres',
                connectionString: '${env.SOURCE_DATABASE_URL}',
              },
              query: 'SELECT * FROM ${env.SOURCE_TABLE} WHERE updated_at > ${context.lastSync}',
              resultFormat: 'json',
            },
            outputs: ['source_data'],
            errorHandling: {
              strategy: 'retry',
              retryConfig: {
                maxAttempts: 3,
                backoffMultiplier: 2,
                maxDelay: 30000,
                initialDelay: 1000,
              },
            },
            performance: {
              timeout: 60000,
              concurrency: 1,
            },
          },
          {
            id: 'transform',
            type: 'transform',
            name: 'Transform Data',
            inputs: ['source_data'],
            config: {
              source: {
                type: 'memory',
                format: 'json',
              },
              transformation: {
                mapping: {
                  id: 'id',
                  name: 'name',
                  updatedAt: 'updated_at',
                  // Add more mappings as needed
                },
                validation: true,
                enrichment: false,
              },
              destination: {
                type: 'memory',
                format: 'json',
              },
            },
            outputs: ['transformed_data'],
            performance: {
              timeout: 30000,
              concurrency: 5,
            },
          },
          {
            id: 'load',
            type: 'distribute',
            name: 'Load to Destination',
            inputs: ['transformed_data'],
            config: {
              destinations: [
                {
                  name: 'destination-db',
                  type: 'database',
                  connection: '${env.DESTINATION_DATABASE_URL}',
                  config: {
                    table: '${env.DESTINATION_TABLE}',
                    mode: 'upsert',
                    upsertKey: 'id',
                  },
                },
              ],
              routing: {
                strategy: 'all',
              },
              delivery: {
                guarantees: 'at-least-once',
                compression: false,
                batchSize: 100,
              },
            },
            errorHandling: {
              strategy: 'retry',
              retryConfig: {
                maxAttempts: 5,
                backoffMultiplier: 2,
                maxDelay: 60000,
                initialDelay: 2000,
              },
            },
            performance: {
              timeout: 120000,
              concurrency: 1,
            },
          },
        ],
        status: 'draft',
        metadata: {
          version: '1.0.0',
          tags: ['basic', 'sync'],
          estimatedDuration: 180000, // 3 minutes
          complexity: 'low',
        },
      },
    });
  }

  /**
   * Get all available templates
   */
  getAllTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }

  /**
   * Get templates by difficulty
   */
  getTemplatesByDifficulty(difficulty: string): WorkflowTemplate[] {
    return this.getAllTemplates().filter(t => t.difficulty === difficulty);
  }

  /**
   * Get a specific template
   */
  getTemplate(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Create a workflow from template
   */
  createFromTemplate(
    template: WorkflowTemplate,
    customization?: {
      name?: string;
      description?: string;
      environment?: Record<string, string>;
    }
  ): CompleteWorkflow {
    const workflow = {
      ...template.workflow,
      id: `workflow-${uuidv4()}`,
      name: customization?.name || template.workflow.name,
      description: customization?.description || template.workflow.description,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as CompleteWorkflow;

    // Replace environment variables if provided
    if (customization?.environment) {
      const workflowStr = JSON.stringify(workflow);
      let replacedStr = workflowStr;
      
      Object.entries(customization.environment).forEach(([key, value]) => {
        const regex = new RegExp(`\\$\\{env\\.${key}\\}`, 'g');
        replacedStr = replacedStr.replace(regex, value);
      });
      
      return JSON.parse(replacedStr);
    }

    return workflow;
  }

  /**
   * Search templates by tags
   */
  searchByTags(tags: string[]): WorkflowTemplate[] {
    return this.getAllTemplates().filter(template =>
      tags.some(tag => template.tags.includes(tag))
    );
  }

  /**
   * Get template recommendations based on requirements
   */
  getRecommendations(requirements: {
    integrations?: string[];
    difficulty?: string;
    category?: string;
    maxSetupTime?: number;
  }): WorkflowTemplate[] {
    let templates = this.getAllTemplates();

    if (requirements.integrations) {
      templates = templates.filter(t =>
        requirements.integrations!.every(int =>
          t.requiredIntegrations.includes(int)
        )
      );
    }

    if (requirements.difficulty) {
      templates = templates.filter(t => t.difficulty === requirements.difficulty);
    }

    if (requirements.category) {
      templates = templates.filter(t => t.category === requirements.category);
    }

    if (requirements.maxSetupTime) {
      templates = templates.filter(t => t.estimatedSetupTime <= requirements.maxSetupTime);
    }

    return templates;
  }
}