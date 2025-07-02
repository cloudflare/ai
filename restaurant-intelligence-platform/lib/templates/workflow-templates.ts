import { z } from 'zod';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'data_processing' | 'marketing' | 'operations' | 'analytics' | 'automation';
  version: string;
  icon: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedSetupTime: number; // minutes
  triggers: TriggerConfig[];
  actions: ActionConfig[];
  conditions: ConditionConfig[];
  variables: VariableConfig[];
  outputs: OutputConfig[];
  requirements: RequirementConfig[];
}

export interface TriggerConfig {
  id: string;
  type: 'schedule' | 'webhook' | 'event' | 'manual' | 'data_change';
  config: Record<string, any>;
  enabled: boolean;
}

export interface ActionConfig {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  dependsOn?: string[];
  retryPolicy?: RetryPolicy;
  timeout?: number;
}

export interface ConditionConfig {
  id: string;
  expression: string;
  operator: 'and' | 'or' | 'not';
  conditions?: ConditionConfig[];
}

export interface VariableConfig {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  defaultValue?: any;
  description: string;
}

export interface OutputConfig {
  name: string;
  type: string;
  description: string;
  format?: string;
}

export interface RequirementConfig {
  type: 'integration' | 'permission' | 'feature';
  name: string;
  version?: string;
  optional?: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'linear' | 'exponential';
  baseDelay: number;
}

// Production Workflow Templates
export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'customer-lifecycle-automation',
    name: 'Customer Lifecycle Marketing Automation',
    description: 'Automated email and SMS campaigns based on customer dining frequency and preferences',
    category: 'marketing',
    version: '1.0.0',
    icon: '📧',
    tags: ['marketing', 'automation', 'email', 'sms', 'retention'],
    difficulty: 'intermediate',
    estimatedSetupTime: 45,
    triggers: [
      {
        id: 'new-customer',
        type: 'event',
        config: {
          event: 'customer.created',
          source: 'pos',
        },
        enabled: true,
      },
      {
        id: 'order-completed',
        type: 'event',
        config: {
          event: 'order.completed',
          source: 'pos',
        },
        enabled: true,
      },
      {
        id: 'customer-inactive',
        type: 'schedule',
        config: {
          cron: '0 9 * * *',
          condition: 'last_visit > 30 days',
        },
        enabled: true,
      },
    ],
    actions: [
      {
        id: 'send-welcome-email',
        name: 'Send Welcome Email',
        type: 'email',
        config: {
          template: 'welcome-series-1',
          delay: 0,
          personalization: {
            name: '{{ customer.name }}',
            preferences: '{{ customer.dietary_preferences }}',
          },
        },
        dependsOn: [],
        retryPolicy: {
          maxAttempts: 3,
          backoffStrategy: 'exponential',
          baseDelay: 300,
        },
        timeout: 30000,
      },
      {
        id: 'schedule-followup',
        name: 'Schedule Follow-up Campaign',
        type: 'schedule_workflow',
        config: {
          workflow: 'welcome-series-2',
          delay: 259200, // 3 days
        },
        dependsOn: ['send-welcome-email'],
      },
      {
        id: 'segment-customer',
        name: 'Add to Customer Segment',
        type: 'segment',
        config: {
          segment: 'new-customers',
          attributes: {
            source: 'automation',
            campaign: 'welcome-series',
          },
        },
        dependsOn: [],
      },
      {
        id: 'send-retention-offer',
        name: 'Send Retention Offer',
        type: 'email',
        config: {
          template: 'retention-offer',
          offer: {
            type: 'percentage',
            value: 15,
            expiry: 604800, // 7 days
          },
        },
        dependsOn: [],
      },
    ],
    conditions: [
      {
        id: 'is-new-customer',
        expression: 'customer.visit_count == 1',
        operator: 'and',
      },
      {
        id: 'has-email',
        expression: 'customer.email != null',
        operator: 'and',
      },
      {
        id: 'opted-in-marketing',
        expression: 'customer.marketing_consent == true',
        operator: 'and',
      },
    ],
    variables: [
      {
        name: 'welcome_delay_hours',
        type: 'number',
        required: false,
        defaultValue: 2,
        description: 'Hours to wait before sending welcome email',
      },
      {
        name: 'retention_threshold_days',
        type: 'number',
        required: false,
        defaultValue: 30,
        description: 'Days since last visit to trigger retention campaign',
      },
      {
        name: 'discount_percentage',
        type: 'number',
        required: false,
        defaultValue: 15,
        description: 'Discount percentage for retention offers',
      },
    ],
    outputs: [
      {
        name: 'campaign_metrics',
        type: 'analytics',
        description: 'Email open rates, click rates, and conversion metrics',
        format: 'json',
      },
      {
        name: 'customer_segments',
        type: 'segments',
        description: 'Updated customer segments with automation tags',
      },
    ],
    requirements: [
      {
        type: 'integration',
        name: 'email_service',
        version: '1.0',
      },
      {
        type: 'integration',
        name: 'pos_system',
        version: '1.0',
      },
      {
        type: 'permission',
        name: 'customer_data_access',
      },
    ],
  },
  {
    id: 'inventory-reorder-automation',
    name: 'Smart Inventory Reorder System',
    description: 'Automated inventory monitoring with predictive reordering based on usage patterns and lead times',
    category: 'operations',
    version: '1.0.0',
    icon: '📎',
    tags: ['inventory', 'automation', 'prediction', 'operations'],
    difficulty: 'advanced',
    estimatedSetupTime: 60,
    triggers: [
      {
        id: 'inventory-check',
        type: 'schedule',
        config: {
          cron: '0 */4 * * *', // Every 4 hours
        },
        enabled: true,
      },
      {
        id: 'low-stock-alert',
        type: 'event',
        config: {
          event: 'inventory.low_stock',
          source: 'inventory_system',
        },
        enabled: true,
      },
    ],
    actions: [
      {
        id: 'fetch-inventory-levels',
        name: 'Fetch Current Inventory Levels',
        type: 'data_fetch',
        config: {
          source: 'inventory_system',
          endpoint: '/api/inventory/current',
          include: ['on_hand', 'par_levels', 'usage_rate'],
        },
      },
      {
        id: 'calculate-forecast',
        name: 'Calculate Demand Forecast',
        type: 'ml_prediction',
        config: {
          model: 'inventory_demand_forecast',
          features: [
            'historical_usage',
            'seasonality',
            'upcoming_events',
            'weather_forecast',
          ],
          horizon_days: 14,
        },
        dependsOn: ['fetch-inventory-levels'],
      },
      {
        id: 'generate-orders',
        name: 'Generate Purchase Orders',
        type: 'generate_po',
        config: {
          supplier_preferences: 'cost_optimized',
          delivery_constraints: {
            preferred_days: ['tuesday', 'thursday'],
            min_order_value: 250,
          },
        },
        dependsOn: ['calculate-forecast'],
      },
      {
        id: 'notify-managers',
        name: 'Notify Kitchen Managers',
        type: 'notification',
        config: {
          channels: ['sms', 'app_notification'],
          recipients: ['kitchen_manager', 'assistant_manager'],
          template: 'purchase_order_generated',
        },
        dependsOn: ['generate-orders'],
      },
    ],
    conditions: [
      {
        id: 'below-reorder-point',
        expression: 'inventory.on_hand <= inventory.reorder_point',
        operator: 'or',
      },
      {
        id: 'predicted-stockout',
        expression: 'forecast.stockout_risk > 0.7',
        operator: 'or',
      },
    ],
    variables: [
      {
        name: 'reorder_buffer_days',
        type: 'number',
        required: false,
        defaultValue: 3,
        description: 'Buffer days to add to lead time for safety stock',
      },
      {
        name: 'stockout_risk_threshold',
        type: 'number',
        required: false,
        defaultValue: 0.7,
        description: 'Risk threshold (0-1) for triggering reorders',
      },
      {
        name: 'max_order_value',
        type: 'number',
        required: false,
        defaultValue: 5000,
        description: 'Maximum order value before requiring approval',
      },
    ],
    outputs: [
      {
        name: 'purchase_orders',
        type: 'orders',
        description: 'Generated purchase orders ready for supplier submission',
        format: 'pdf',
      },
      {
        name: 'forecast_accuracy',
        type: 'metrics',
        description: 'Model accuracy metrics and prediction confidence',
      },
    ],
    requirements: [
      {
        type: 'integration',
        name: 'inventory_system',
        version: '1.0',
      },
      {
        type: 'integration',
        name: 'supplier_portal',
        optional: true,
      },
      {
        type: 'feature',
        name: 'ml_forecasting',
      },
    ],
  },
  {
    id: 'labor-optimization-scheduler',
    name: 'AI-Powered Labor Scheduling',
    description: 'Optimize staff scheduling based on forecasted demand, labor costs, and employee preferences',
    category: 'operations',
    version: '1.0.0',
    icon: '📅',
    tags: ['scheduling', 'labor', 'optimization', 'ai'],
    difficulty: 'advanced',
    estimatedSetupTime: 90,
    triggers: [
      {
        id: 'weekly-schedule',
        type: 'schedule',
        config: {
          cron: '0 10 * * WED', // Every Wednesday at 10 AM
        },
        enabled: true,
      },
      {
        id: 'demand-spike',
        type: 'event',
        config: {
          event: 'demand.spike_detected',
          threshold: 1.3, // 30% above normal
        },
        enabled: true,
      },
    ],
    actions: [
      {
        id: 'fetch-forecast',
        name: 'Fetch Demand Forecast',
        type: 'data_fetch',
        config: {
          source: 'analytics_engine',
          metrics: ['hourly_sales_forecast', 'guest_count_forecast'],
          period: '14 days',
        },
      },
      {
        id: 'get-staff-availability',
        name: 'Get Staff Availability',
        type: 'data_fetch',
        config: {
          source: 'hr_system',
          include: ['availability', 'preferences', 'skills', 'labor_rates'],
        },
        dependsOn: [],
      },
      {
        id: 'optimize-schedule',
        name: 'Generate Optimal Schedule',
        type: 'optimization',
        config: {
          algorithm: 'mixed_integer_programming',
          objectives: [
            'minimize_labor_cost',
            'maximize_service_quality',
            'balance_fairness',
          ],
          constraints: [
            'min_staffing_levels',
            'max_weekly_hours',
            'skill_requirements',
            'availability_windows',
          ],
        },
        dependsOn: ['fetch-forecast', 'get-staff-availability'],
      },
      {
        id: 'publish-schedule',
        name: 'Publish Schedule',
        type: 'schedule_publish',
        config: {
          channels: ['staff_app', 'email', 'print'],
          advance_notice_hours: 72,
        },
        dependsOn: ['optimize-schedule'],
      },
    ],
    conditions: [
      {
        id: 'forecast-available',
        expression: 'forecast.confidence > 0.8',
        operator: 'and',
      },
      {
        id: 'sufficient-staff',
        expression: 'available_staff.count >= minimum_required',
        operator: 'and',
      },
    ],
    variables: [
      {
        name: 'labor_cost_target',
        type: 'number',
        required: false,
        defaultValue: 28,
        description: 'Target labor cost percentage of sales',
      },
      {
        name: 'advance_notice_hours',
        type: 'number',
        required: false,
        defaultValue: 72,
        description: 'Hours of advance notice for schedule changes',
      },
      {
        name: 'fairness_weight',
        type: 'number',
        required: false,
        defaultValue: 0.3,
        description: 'Weight for schedule fairness in optimization (0-1)',
      },
    ],
    outputs: [
      {
        name: 'optimized_schedule',
        type: 'schedule',
        description: 'Complete staff schedule with shifts and assignments',
        format: 'ical',
      },
      {
        name: 'labor_forecast',
        type: 'metrics',
        description: 'Projected labor costs and efficiency metrics',
      },
    ],
    requirements: [
      {
        type: 'integration',
        name: 'hr_system',
        version: '1.0',
      },
      {
        type: 'integration',
        name: 'pos_system',
        version: '1.0',
      },
      {
        type: 'feature',
        name: 'optimization_engine',
      },
    ],
  },
  {
    id: 'revenue-optimization-pricing',
    name: 'Dynamic Revenue Optimization',
    description: 'Real-time menu pricing optimization based on demand, inventory, and competitive analysis',
    category: 'analytics',
    version: '1.0.0',
    icon: '💰',
    tags: ['pricing', 'revenue', 'optimization', 'dynamic'],
    difficulty: 'advanced',
    estimatedSetupTime: 120,
    triggers: [
      {
        id: 'daily-pricing-review',
        type: 'schedule',
        config: {
          cron: '0 6 * * *', // Daily at 6 AM
        },
        enabled: true,
      },
      {
        id: 'inventory-change',
        type: 'event',
        config: {
          event: 'inventory.significant_change',
          threshold: 0.2, // 20% change
        },
        enabled: true,
      },
      {
        id: 'competitor-price-change',
        type: 'event',
        config: {
          event: 'competitor.price_change',
          source: 'price_monitoring',
        },
        enabled: true,
      },
    ],
    actions: [
      {
        id: 'analyze-demand-patterns',
        name: 'Analyze Demand Patterns',
        type: 'analytics',
        config: {
          metrics: [
            'price_elasticity',
            'demand_curves',
            'seasonal_trends',
            'competitor_impact',
          ],
          lookback_days: 90,
        },
      },
      {
        id: 'calculate-optimal-prices',
        name: 'Calculate Optimal Prices',
        type: 'optimization',
        config: {
          algorithm: 'revenue_maximization',
          constraints: [
            'minimum_margin',
            'maximum_price_increase',
            'competitive_bounds',
          ],
          objectives: ['maximize_revenue', 'maintain_volume'],
        },
        dependsOn: ['analyze-demand-patterns'],
      },
      {
        id: 'test-price-changes',
        name: 'A/B Test Price Changes',
        type: 'ab_test',
        config: {
          test_duration_hours: 24,
          traffic_split: 0.5,
          success_metrics: ['revenue', 'conversion_rate'],
        },
        dependsOn: ['calculate-optimal-prices'],
      },
      {
        id: 'implement-winners',
        name: 'Implement Winning Prices',
        type: 'price_update',
        config: {
          confidence_threshold: 0.95,
          rollout_strategy: 'gradual',
        },
        dependsOn: ['test-price-changes'],
      },
    ],
    conditions: [
      {
        id: 'sufficient-data',
        expression: 'order_count > 100 AND days_of_data > 30',
        operator: 'and',
      },
      {
        id: 'stable-operations',
        expression: 'system_uptime > 0.99',
        operator: 'and',
      },
    ],
    variables: [
      {
        name: 'max_price_increase',
        type: 'number',
        required: false,
        defaultValue: 0.15,
        description: 'Maximum price increase as a percentage (0-1)',
      },
      {
        name: 'minimum_margin',
        type: 'number',
        required: false,
        defaultValue: 0.65,
        description: 'Minimum gross margin to maintain',
      },
      {
        name: 'test_confidence_level',
        type: 'number',
        required: false,
        defaultValue: 0.95,
        description: 'Statistical confidence level for A/B tests',
      },
    ],
    outputs: [
      {
        name: 'pricing_recommendations',
        type: 'recommendations',
        description: 'Optimized menu prices with revenue impact projections',
      },
      {
        name: 'test_results',
        type: 'analytics',
        description: 'A/B test results and performance metrics',
      },
    ],
    requirements: [
      {
        type: 'integration',
        name: 'pos_system',
        version: '1.0',
      },
      {
        type: 'integration',
        name: 'competitor_monitoring',
        optional: true,
      },
      {
        type: 'feature',
        name: 'ab_testing_framework',
      },
    ],
  },
  {
    id: 'guest-feedback-analysis',
    name: 'AI Guest Feedback Analysis',
    description: 'Automated sentiment analysis and actionable insights from customer reviews and feedback',
    category: 'analytics',
    version: '1.0.0',
    icon: '💬',
    tags: ['feedback', 'sentiment', 'ai', 'customer-service'],
    difficulty: 'intermediate',
    estimatedSetupTime: 45,
    triggers: [
      {
        id: 'new-review',
        type: 'webhook',
        config: {
          endpoint: '/webhook/review',
          sources: ['google', 'yelp', 'tripadvisor', 'opentable'],
        },
        enabled: true,
      },
      {
        id: 'survey-response',
        type: 'event',
        config: {
          event: 'survey.completed',
          source: 'feedback_system',
        },
        enabled: true,
      },
    ],
    actions: [
      {
        id: 'analyze-sentiment',
        name: 'Analyze Sentiment and Topics',
        type: 'ai_analysis',
        config: {
          models: ['sentiment_analysis', 'topic_extraction', 'emotion_detection'],
          language_support: ['en', 'es', 'fr'],
        },
      },
      {
        id: 'categorize-feedback',
        name: 'Categorize Feedback',
        type: 'classification',
        config: {
          categories: [
            'food_quality',
            'service',
            'ambiance',
            'value',
            'cleanliness',
            'staff_behavior',
          ],
          confidence_threshold: 0.8,
        },
        dependsOn: ['analyze-sentiment'],
      },
      {
        id: 'identify-action-items',
        name: 'Identify Action Items',
        type: 'action_extraction',
        config: {
          priority_scoring: true,
          assignee_suggestion: true,
        },
        dependsOn: ['categorize-feedback'],
      },
      {
        id: 'generate-response',
        name: 'Generate Response Draft',
        type: 'response_generation',
        config: {
          tone: 'professional_friendly',
          personalization: true,
          approval_required: true,
        },
        dependsOn: ['analyze-sentiment'],
      },
    ],
    conditions: [
      {
        id: 'negative-sentiment',
        expression: 'sentiment.score < -0.3',
        operator: 'or',
      },
      {
        id: 'mentions-management',
        expression: 'feedback.mentions_management == true',
        operator: 'or',
      },
    ],
    variables: [
      {
        name: 'sentiment_threshold',
        type: 'number',
        required: false,
        defaultValue: -0.3,
        description: 'Threshold for flagging negative sentiment (-1 to 1)',
      },
      {
        name: 'auto_response_enabled',
        type: 'boolean',
        required: false,
        defaultValue: false,
        description: 'Enable automatic response generation',
      },
      {
        name: 'escalation_keywords',
        type: 'array',
        required: false,
        defaultValue: ['manager', 'complaint', 'refund', 'terrible'],
        description: 'Keywords that trigger management escalation',
      },
    ],
    outputs: [
      {
        name: 'sentiment_report',
        type: 'analytics',
        description: 'Comprehensive sentiment analysis with trends',
      },
      {
        name: 'action_items',
        type: 'tasks',
        description: 'Prioritized action items for management',
      },
      {
        name: 'response_drafts',
        type: 'content',
        description: 'AI-generated response drafts for approval',
      },
    ],
    requirements: [
      {
        type: 'integration',
        name: 'review_platforms',
        version: '1.0',
      },
      {
        type: 'feature',
        name: 'ai_text_analysis',
      },
    ],
  },
  {
    id: 'real-time-alert-system',
    name: 'Real-Time Operations Alert System',
    description: 'Comprehensive monitoring with intelligent alerting for operational issues and opportunities',
    category: 'operations',
    version: '1.0.0',
    icon: '🚨',
    tags: ['alerts', 'monitoring', 'real-time', 'operations'],
    difficulty: 'intermediate',
    estimatedSetupTime: 30,
    triggers: [
      {
        id: 'metric-threshold',
        type: 'data_change',
        config: {
          metrics: [
            'wait_time',
            'kitchen_ticket_time',
            'inventory_levels',
            'pos_system_errors',
          ],
          check_interval: 60, // seconds
        },
        enabled: true,
      },
      {
        id: 'system-health',
        type: 'schedule',
        config: {
          cron: '*/5 * * * *', // Every 5 minutes
        },
        enabled: true,
      },
    ],
    actions: [
      {
        id: 'evaluate-conditions',
        name: 'Evaluate Alert Conditions',
        type: 'condition_check',
        config: {
          rules: [
            {
              name: 'excessive_wait_time',
              condition: 'avg_wait_time > 15 minutes',
              severity: 'high',
            },
            {
              name: 'kitchen_backup',
              condition: 'kitchen_ticket_time > 20 minutes',
              severity: 'high',
            },
            {
              name: 'inventory_critical',
              condition: 'inventory_level < 10% of par',
              severity: 'critical',
            },
          ],
        },
      },
      {
        id: 'send-alerts',
        name: 'Send Targeted Alerts',
        type: 'multi_channel_alert',
        config: {
          channels: {
            sms: ['manager', 'assistant_manager'],
            email: ['district_manager'],
            push: ['staff_app_users'],
            dashboard: ['all_users'],
          },
          escalation_delay: 300, // 5 minutes
        },
        dependsOn: ['evaluate-conditions'],
      },
      {
        id: 'log-incident',
        name: 'Log Incident',
        type: 'incident_logging',
        config: {
          include_context: true,
          auto_assign: true,
        },
        dependsOn: ['evaluate-conditions'],
      },
    ],
    conditions: [
      {
        id: 'business-hours',
        expression: 'current_time BETWEEN open_time AND close_time',
        operator: 'and',
      },
      {
        id: 'not-maintenance-mode',
        expression: 'maintenance_mode == false',
        operator: 'and',
      },
    ],
    variables: [
      {
        name: 'wait_time_threshold',
        type: 'number',
        required: false,
        defaultValue: 15,
        description: 'Maximum acceptable wait time in minutes',
      },
      {
        name: 'alert_cooldown',
        type: 'number',
        required: false,
        defaultValue: 300,
        description: 'Cooldown period between similar alerts in seconds',
      },
      {
        name: 'escalation_enabled',
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Enable alert escalation to higher management',
      },
    ],
    outputs: [
      {
        name: 'alert_log',
        type: 'log',
        description: 'Complete log of all alerts and responses',
      },
      {
        name: 'performance_metrics',
        type: 'metrics',
        description: 'Alert response times and resolution metrics',
      },
    ],
    requirements: [
      {
        type: 'integration',
        name: 'pos_system',
        version: '1.0',
      },
      {
        type: 'integration',
        name: 'notification_service',
        version: '1.0',
      },
    ],
  },
];

// Template utility functions
export function getWorkflowTemplateById(id: string): WorkflowTemplate | undefined {
  return workflowTemplates.find(t => t.id === id);
}

export function getWorkflowTemplatesByCategory(category: string): WorkflowTemplate[] {
  return workflowTemplates.filter(t => t.category === category);
}

export function getWorkflowTemplatesByDifficulty(difficulty: string): WorkflowTemplate[] {
  return workflowTemplates.filter(t => t.difficulty === difficulty);
}

export function searchWorkflowTemplates(query: string): WorkflowTemplate[] {
  const searchTerms = query.toLowerCase().split(' ');
  return workflowTemplates.filter(template => {
    const searchText = [
      template.name,
      template.description,
      ...template.tags,
    ].join(' ').toLowerCase();
    
    return searchTerms.every(term => searchText.includes(term));
  });
}

// Template instantiation
export async function instantiateWorkflow(
  templateId: string,
  config: {
    name: string;
    variables?: Record<string, any>;
    enabledTriggers?: string[];
    enabledActions?: string[];
  }
): Promise<{
  success: boolean;
  workflowId?: string;
  errors?: string[];
}> {
  const template = getWorkflowTemplateById(templateId);
  if (!template) {
    return {
      success: false,
      errors: ['Template not found'],
    };
  }

  try {
    // Validate variables
    const errors: string[] = [];
    const variables = config.variables || {};
    
    for (const variable of template.variables) {
      if (variable.required && !(variable.name in variables)) {
        errors.push(`Missing required variable: ${variable.name}`);
      }
      
      if (variable.name in variables) {
        const value = variables[variable.name];
        const expectedType = variable.type;
        
        if (expectedType === 'array' && !Array.isArray(value)) {
          errors.push(`Variable ${variable.name} must be an array`);
        } else if (expectedType !== 'array' && typeof value !== expectedType) {
          errors.push(`Variable ${variable.name} must be of type ${expectedType}`);
        }
      }
    }
    
    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    // Create workflow instance
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Here you would integrate with your workflow engine
    // For now, we'll simulate success
    
    return {
      success: true,
      workflowId,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// Template validation
export function validateWorkflowTemplate(template: WorkflowTemplate): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check required fields
  if (!template.id) errors.push('Template ID is required');
  if (!template.name) errors.push('Template name is required');
  if (!template.triggers.length) errors.push('At least one trigger is required');
  if (!template.actions.length) errors.push('At least one action is required');
  
  // Check trigger dependencies
  template.triggers.forEach(trigger => {
    if (!trigger.id) errors.push('Trigger ID is required');
    if (!trigger.type) errors.push('Trigger type is required');
  });
  
  // Check action dependencies
  const actionIds = new Set(template.actions.map(a => a.id));
  template.actions.forEach(action => {
    if (!action.id) errors.push('Action ID is required');
    if (!action.type) errors.push('Action type is required');
    
    if (action.dependsOn) {
      action.dependsOn.forEach(dep => {
        if (!actionIds.has(dep)) {
          errors.push(`Action dependency '${dep}' not found in action list`);
        }
      });
    }
  });
  
  // Check for circular dependencies
  const hasCyclicDependency = (actionId: string, visited = new Set()): boolean => {
    if (visited.has(actionId)) return true;
    visited.add(actionId);
    
    const action = template.actions.find(a => a.id === actionId);
    if (!action?.dependsOn) return false;
    
    return action.dependsOn.some(dep => hasCyclicDependency(dep, new Set(visited)));
  };
  
  template.actions.forEach(action => {
    if (hasCyclicDependency(action.id)) {
      errors.push(`Circular dependency detected for action '${action.id}'`);
    }
  });
  
  // Warnings
  if (template.estimatedSetupTime > 120) {
    warnings.push('Setup time is quite long - consider breaking into smaller templates');
  }
  
  if (template.actions.length > 10) {
    warnings.push('Many actions detected - consider optimizing workflow complexity');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}