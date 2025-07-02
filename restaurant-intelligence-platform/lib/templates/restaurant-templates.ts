import { z } from 'zod';

export interface RestaurantTemplate {
  id: string;
  name: string;
  description: string;
  category: 'operations' | 'marketing' | 'analytics' | 'customer' | 'financial';
  icon: string;
  enabled: boolean;
  configuration: Record<string, any>;
  workflows: WorkflowConfig[];
  dataModels: DataModelConfig[];
  integrations: IntegrationConfig[];
  alerts: AlertConfig[];
  dashboards: DashboardConfig[];
}

export interface WorkflowConfig {
  id: string;
  name: string;
  trigger: 'schedule' | 'event' | 'manual' | 'webhook';
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  type: 'data_fetch' | 'transform' | 'analyze' | 'alert' | 'action';
  config: Record<string, any>;
  conditions?: Record<string, any>;
}

export interface DataModelConfig {
  name: string;
  schema: z.ZodSchema;
  relationships: RelationshipConfig[];
}

export interface RelationshipConfig {
  from: string;
  to: string;
  type: 'has_many' | 'belongs_to' | 'has_one';
  through?: string;
}

export interface IntegrationConfig {
  type: string;
  enabled: boolean;
  config: Record<string, any>;
}

export interface AlertConfig {
  id: string;
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  channels: string[];
}

export interface DashboardConfig {
  id: string;
  name: string;
  widgets: WidgetConfig[];
}

export interface WidgetConfig {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'map' | 'timeline';
  dataSource: string;
  config: Record<string, any>;
}

// Restaurant Industry Templates
export const restaurantTemplates: RestaurantTemplate[] = [
  {
    id: 'quick-service-restaurant',
    name: 'Quick Service Restaurant (QSR)',
    description: 'Optimized for fast-paced operations with focus on speed of service, inventory turnover, and customer throughput',
    category: 'operations',
    icon: '🍔',
    enabled: true,
    configuration: {
      avgTicketTime: 180, // 3 minutes
      peakHours: ['11:30-13:30', '17:30-19:30'],
      inventoryTurnover: 7, // days
      laborTargetPercent: 25,
    },
    workflows: [
      {
        id: 'qsr-peak-hour-optimization',
        name: 'Peak Hour Staff Optimization',
        trigger: 'schedule',
        steps: [
          {
            id: 'fetch-hourly-sales',
            type: 'data_fetch',
            config: {
              source: 'pos',
              metric: 'hourly_sales',
              lookback: '4 weeks',
            },
          },
          {
            id: 'analyze-patterns',
            type: 'analyze',
            config: {
              algorithm: 'time_series_forecast',
              features: ['day_of_week', 'weather', 'local_events'],
            },
          },
          {
            id: 'optimize-schedule',
            type: 'action',
            config: {
              action: 'generate_staff_schedule',
              constraints: ['min_staff', 'max_hours', 'availability'],
            },
          },
        ],
      },
      {
        id: 'qsr-inventory-alert',
        name: 'Real-time Inventory Monitoring',
        trigger: 'event',
        steps: [
          {
            id: 'monitor-inventory',
            type: 'data_fetch',
            config: {
              source: 'inventory_system',
              realtime: true,
            },
          },
          {
            id: 'check-thresholds',
            type: 'analyze',
            config: {
              thresholds: {
                critical: 0.1, // 10% of par
                warning: 0.25, // 25% of par
              },
            },
          },
          {
            id: 'alert-manager',
            type: 'alert',
            config: {
              channels: ['sms', 'app_notification'],
              priority: 'high',
            },
            conditions: {
              inventory_level: '< critical',
            },
          },
        ],
      },
    ],
    dataModels: [
      {
        name: 'MenuItem',
        schema: z.object({
          id: z.string(),
          name: z.string(),
          category: z.string(),
          price: z.number(),
          cost: z.number(),
          prepTime: z.number(),
          popularity: z.number(),
          ingredients: z.array(z.string()),
        }),
        relationships: [
          {
            from: 'MenuItem',
            to: 'Ingredient',
            type: 'has_many',
            through: 'RecipeItem',
          },
        ],
      },
    ],
    integrations: [
      {
        type: 'toast_pos',
        enabled: true,
        config: {
          syncInterval: 300, // 5 minutes
          endpoints: ['orders', 'inventory', 'labor'],
        },
      },
      {
        type: '7shifts',
        enabled: true,
        config: {
          syncInterval: 900, // 15 minutes
          features: ['scheduling', 'time_tracking'],
        },
      },
    ],
    alerts: [
      {
        id: 'speed-of-service',
        name: 'Speed of Service Alert',
        metric: 'avg_ticket_time',
        condition: '>',
        threshold: 240, // 4 minutes
        channels: ['dashboard', 'sms'],
      },
      {
        id: 'labor-cost',
        name: 'Labor Cost Threshold',
        metric: 'labor_cost_percent',
        condition: '>',
        threshold: 28,
        channels: ['email', 'dashboard'],
      },
    ],
    dashboards: [
      {
        id: 'qsr-operations',
        name: 'QSR Operations Dashboard',
        widgets: [
          {
            id: 'speed-metric',
            type: 'metric',
            dataSource: 'pos.ticket_times',
            config: {
              title: 'Avg Speed of Service',
              format: 'duration',
              comparison: 'previous_period',
            },
          },
          {
            id: 'hourly-sales',
            type: 'chart',
            dataSource: 'pos.sales',
            config: {
              chartType: 'line',
              timeGrain: 'hour',
              metrics: ['revenue', 'transaction_count'],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'fine-dining',
    name: 'Fine Dining Restaurant',
    description: 'Focused on guest experience, wine pairings, seasonal menus, and reservation management',
    category: 'customer',
    icon: '🍷',
    enabled: true,
    configuration: {
      avgCheckSize: 150,
      tableCount: 25,
      avgTableTime: 120, // minutes
      reservationLeadTime: 14, // days
      wineInventoryValue: 50000,
    },
    workflows: [
      {
        id: 'guest-experience-tracking',
        name: 'Guest Experience Journey',
        trigger: 'event',
        steps: [
          {
            id: 'reservation-made',
            type: 'data_fetch',
            config: {
              source: 'reservation_system',
              event: 'new_reservation',
            },
          },
          {
            id: 'preference-lookup',
            type: 'analyze',
            config: {
              action: 'fetch_guest_preferences',
              include: ['dietary_restrictions', 'wine_preferences', 'special_occasions'],
            },
          },
          {
            id: 'personalize-experience',
            type: 'action',
            config: {
              actions: [
                'notify_chef_restrictions',
                'prepare_wine_recommendations',
                'assign_preferred_table',
              ],
            },
          },
        ],
      },
      {
        id: 'wine-pairing-optimization',
        name: 'Dynamic Wine Pairing',
        trigger: 'manual',
        steps: [
          {
            id: 'analyze-menu',
            type: 'analyze',
            config: {
              source: 'menu_items',
              algorithm: 'flavor_profile_matching',
            },
          },
          {
            id: 'wine-inventory-check',
            type: 'data_fetch',
            config: {
              source: 'wine_inventory',
              include_metrics: ['stock_level', 'vintage', 'rating'],
            },
          },
          {
            id: 'generate-pairings',
            type: 'transform',
            config: {
              algorithm: 'wine_pairing_ml',
              output: 'pairing_recommendations',
            },
          },
        ],
      },
    ],
    dataModels: [
      {
        name: 'Guest',
        schema: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string().email(),
          phone: z.string(),
          preferences: z.object({
            dietary: z.array(z.string()),
            wine: z.array(z.string()),
            seating: z.string().optional(),
          }),
          visitHistory: z.array(z.string()),
          totalSpend: z.number(),
          vipStatus: z.boolean(),
        }),
        relationships: [
          {
            from: 'Guest',
            to: 'Reservation',
            type: 'has_many',
          },
          {
            from: 'Guest',
            to: 'Order',
            type: 'has_many',
          },
        ],
      },
      {
        name: 'WineInventory',
        schema: z.object({
          id: z.string(),
          name: z.string(),
          vintage: z.number(),
          region: z.string(),
          varietal: z.string(),
          currentStock: z.number(),
          parLevel: z.number(),
          costPerBottle: z.number(),
          listPrice: z.number(),
        }),
        relationships: [
          {
            from: 'WineInventory',
            to: 'MenuItem',
            type: 'has_many',
            through: 'WinePairing',
          },
        ],
      },
    ],
    integrations: [
      {
        type: 'opentable',
        enabled: true,
        config: {
          syncInterval: 300,
          twoWaySync: true,
        },
      },
      {
        type: 'wine_spectator_api',
        enabled: true,
        config: {
          updateFrequency: 'daily',
        },
      },
    ],
    alerts: [
      {
        id: 'vip-reservation',
        name: 'VIP Guest Reservation',
        metric: 'guest.vip_status',
        condition: '==',
        threshold: 1,
        channels: ['sms', 'app_notification'],
      },
      {
        id: 'wine-stock-low',
        name: 'Premium Wine Stock Alert',
        metric: 'wine.stock_vs_par',
        condition: '<',
        threshold: 0.3,
        channels: ['email'],
      },
    ],
    dashboards: [
      {
        id: 'guest-experience',
        name: 'Guest Experience Dashboard',
        widgets: [
          {
            id: 'reservation-timeline',
            type: 'timeline',
            dataSource: 'reservations',
            config: {
              view: 'day',
              showGuestDetails: true,
            },
          },
          {
            id: 'wine-performance',
            type: 'table',
            dataSource: 'wine_sales',
            config: {
              metrics: ['bottles_sold', 'revenue', 'margin'],
              groupBy: 'varietal',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'multi-location-chain',
    name: 'Multi-Location Restaurant Chain',
    description: 'Centralized management for multiple locations with consistency monitoring and performance benchmarking',
    category: 'analytics',
    icon: '🏢',
    enabled: true,
    configuration: {
      locationCount: 25,
      reportingHierarchy: ['region', 'district', 'location'],
      standardizedMenuPercent: 80,
      centralizedPurchasing: true,
    },
    workflows: [
      {
        id: 'cross-location-benchmarking',
        name: 'Location Performance Benchmarking',
        trigger: 'schedule',
        steps: [
          {
            id: 'collect-metrics',
            type: 'data_fetch',
            config: {
              sources: ['all_locations'],
              metrics: ['sales', 'labor', 'food_cost', 'guest_satisfaction'],
              period: 'daily',
            },
          },
          {
            id: 'calculate-benchmarks',
            type: 'analyze',
            config: {
              calculations: ['percentiles', 'moving_averages', 'trend_analysis'],
              groupBy: ['region', 'location_type'],
            },
          },
          {
            id: 'identify-outliers',
            type: 'transform',
            config: {
              algorithm: 'statistical_outlier_detection',
              sensitivity: 0.95,
            },
          },
          {
            id: 'generate-action-items',
            type: 'action',
            config: {
              output: 'location_action_plans',
              assignTo: 'district_managers',
            },
          },
        ],
      },
      {
        id: 'menu-consistency-monitor',
        name: 'Menu Execution Consistency',
        trigger: 'event',
        steps: [
          {
            id: 'monitor-recipes',
            type: 'data_fetch',
            config: {
              source: 'kitchen_display_system',
              metrics: ['prep_time', 'portion_size', 'presentation_score'],
            },
          },
          {
            id: 'compare-standards',
            type: 'analyze',
            config: {
              baseline: 'corporate_standards',
              tolerance: 0.1, // 10% variance allowed
            },
          },
          {
            id: 'training-recommendation',
            type: 'action',
            config: {
              action: 'generate_training_plan',
              conditions: {
                variance: '> tolerance',
              },
            },
          },
        ],
      },
    ],
    dataModels: [
      {
        name: 'Location',
        schema: z.object({
          id: z.string(),
          name: z.string(),
          region: z.string(),
          district: z.string(),
          type: z.enum(['flagship', 'standard', 'express']),
          openDate: z.date(),
          squareFootage: z.number(),
          seatingCapacity: z.number(),
          parkingSpaces: z.number(),
        }),
        relationships: [
          {
            from: 'Location',
            to: 'Employee',
            type: 'has_many',
          },
          {
            from: 'Location',
            to: 'DailyMetrics',
            type: 'has_many',
          },
        ],
      },
    ],
    integrations: [
      {
        type: 'central_pos_aggregator',
        enabled: true,
        config: {
          pollInterval: 900, // 15 minutes
          locations: 'all',
        },
      },
      {
        type: 'corporate_erp',
        enabled: true,
        config: {
          modules: ['finance', 'inventory', 'hr'],
        },
      },
    ],
    alerts: [
      {
        id: 'location-underperformance',
        name: 'Location Performance Alert',
        metric: 'location.sales_vs_forecast',
        condition: '<',
        threshold: 0.85, // 85% of forecast
        channels: ['email', 'dashboard'],
      },
    ],
    dashboards: [
      {
        id: 'executive-overview',
        name: 'Executive Chain Overview',
        widgets: [
          {
            id: 'location-map',
            type: 'map',
            dataSource: 'locations',
            config: {
              showMetrics: ['daily_sales', 'status'],
              heatmapMetric: 'sales_growth',
            },
          },
          {
            id: 'chain-kpis',
            type: 'metric',
            dataSource: 'aggregated_metrics',
            config: {
              metrics: ['total_revenue', 'avg_check', 'labor_percent'],
              comparison: 'year_over_year',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'ghost-kitchen',
    name: 'Ghost Kitchen / Cloud Kitchen',
    description: 'Optimized for delivery-only operations with multi-brand management and delivery platform integration',
    category: 'operations',
    icon: '👻',
    enabled: true,
    configuration: {
      brandCount: 5,
      deliveryPlatforms: ['doordash', 'ubereats', 'grubhub'],
      avgDeliveryTime: 25, // minutes
      kitchenUtilization: 0.85,
    },
    workflows: [
      {
        id: 'multi-brand-optimization',
        name: 'Multi-Brand Kitchen Optimization',
        trigger: 'event',
        steps: [
          {
            id: 'aggregate-orders',
            type: 'data_fetch',
            config: {
              sources: ['all_delivery_platforms'],
              realtime: true,
            },
          },
          {
            id: 'optimize-prep-sequence',
            type: 'analyze',
            config: {
              algorithm: 'kitchen_flow_optimization',
              constraints: ['equipment', 'staff', 'delivery_time'],
            },
          },
          {
            id: 'dispatch-orders',
            type: 'action',
            config: {
              target: 'kitchen_display_system',
              prioritization: 'delivery_time_optimal',
            },
          },
        ],
      },
      {
        id: 'demand-forecasting',
        name: 'Delivery Demand Forecasting',
        trigger: 'schedule',
        steps: [
          {
            id: 'historical-analysis',
            type: 'data_fetch',
            config: {
              lookback: '12 weeks',
              include: ['weather', 'events', 'promotions'],
            },
          },
          {
            id: 'ml-forecast',
            type: 'analyze',
            config: {
              model: 'ensemble_forecast',
              horizon: '7 days',
              granularity: 'hourly',
            },
          },
          {
            id: 'prep-planning',
            type: 'action',
            config: {
              generate: ['prep_lists', 'staff_schedule', 'inventory_orders'],
            },
          },
        ],
      },
    ],
    dataModels: [
      {
        name: 'VirtualBrand',
        schema: z.object({
          id: z.string(),
          name: z.string(),
          cuisine: z.string(),
          menuItems: z.array(z.string()),
          platforms: z.array(z.string()),
          avgOrderValue: z.number(),
          rating: z.number(),
        }),
        relationships: [
          {
            from: 'VirtualBrand',
            to: 'MenuItem',
            type: 'has_many',
          },
          {
            from: 'VirtualBrand',
            to: 'DeliveryOrder',
            type: 'has_many',
          },
        ],
      },
    ],
    integrations: [
      {
        type: 'delivery_aggregator',
        enabled: true,
        config: {
          platforms: ['doordash', 'ubereats', 'grubhub'],
          syncMode: 'realtime',
        },
      },
    ],
    alerts: [
      {
        id: 'delivery-time-breach',
        name: 'Delivery Time SLA Breach',
        metric: 'avg_delivery_time',
        condition: '>',
        threshold: 35, // minutes
        channels: ['sms', 'dashboard'],
      },
    ],
    dashboards: [
      {
        id: 'ghost-kitchen-ops',
        name: 'Ghost Kitchen Operations',
        widgets: [
          {
            id: 'brand-performance',
            type: 'chart',
            dataSource: 'brand_metrics',
            config: {
              chartType: 'stacked_bar',
              metrics: ['orders', 'revenue'],
              groupBy: 'brand',
            },
          },
          {
            id: 'kitchen-utilization',
            type: 'metric',
            dataSource: 'kitchen_metrics',
            config: {
              metric: 'utilization_percent',
              target: 85,
              format: 'percentage',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'farm-to-table',
    name: 'Farm-to-Table Restaurant',
    description: 'Focus on local sourcing, seasonal menus, sustainability tracking, and supplier relationships',
    category: 'operations',
    icon: '🌾',
    enabled: true,
    configuration: {
      localSourcingTarget: 80, // percent
      menuChangeFrequency: 'seasonal',
      supplierCount: 25,
      sustainabilityTracking: true,
    },
    workflows: [
      {
        id: 'seasonal-menu-planning',
        name: 'Seasonal Menu Development',
        trigger: 'schedule',
        steps: [
          {
            id: 'harvest-calendar',
            type: 'data_fetch',
            config: {
              source: 'supplier_apis',
              data: 'seasonal_availability',
              lookAhead: '8 weeks',
            },
          },
          {
            id: 'menu-optimization',
            type: 'analyze',
            config: {
              factors: ['availability', 'cost', 'popularity', 'prep_complexity'],
              constraints: ['dietary_options', 'price_points'],
            },
          },
          {
            id: 'recipe-costing',
            type: 'transform',
            config: {
              calculate: ['food_cost', 'margin', 'nutritional_info'],
            },
          },
          {
            id: 'publish-menu',
            type: 'action',
            config: {
              channels: ['website', 'pos', 'print'],
              includeStory: true,
            },
          },
        ],
      },
      {
        id: 'sustainability-reporting',
        name: 'Sustainability Impact Tracking',
        trigger: 'schedule',
        steps: [
          {
            id: 'collect-metrics',
            type: 'data_fetch',
            config: {
              metrics: ['food_miles', 'waste', 'energy_usage', 'water_usage'],
              period: 'monthly',
            },
          },
          {
            id: 'calculate-impact',
            type: 'analyze',
            config: {
              calculations: ['carbon_footprint', 'waste_diversion', 'local_impact'],
            },
          },
          {
            id: 'generate-report',
            type: 'action',
            config: {
              format: 'sustainability_dashboard',
              share: ['website', 'social_media'],
            },
          },
        ],
      },
    ],
    dataModels: [
      {
        name: 'Supplier',
        schema: z.object({
          id: z.string(),
          name: z.string(),
          type: z.enum(['farm', 'ranch', 'fishery', 'artisan']),
          location: z.object({
            address: z.string(),
            distance: z.number(),
            coordinates: z.tuple([z.number(), z.number()]),
          }),
          certifications: z.array(z.string()),
          products: z.array(z.string()),
        }),
        relationships: [
          {
            from: 'Supplier',
            to: 'Ingredient',
            type: 'has_many',
          },
          {
            from: 'Supplier',
            to: 'PurchaseOrder',
            type: 'has_many',
          },
        ],
      },
    ],
    integrations: [
      {
        type: 'local_food_hub',
        enabled: true,
        config: {
          region: 'pacific_northwest',
          radius: 150, // miles
        },
      },
    ],
    alerts: [
      {
        id: 'supplier-delivery',
        name: 'Supplier Delivery Alert',
        metric: 'delivery.on_time_rate',
        condition: '<',
        threshold: 0.9,
        channels: ['email'],
      },
    ],
    dashboards: [
      {
        id: 'sustainability',
        name: 'Sustainability Dashboard',
        widgets: [
          {
            id: 'local-sourcing',
            type: 'metric',
            dataSource: 'purchasing',
            config: {
              metric: 'local_sourcing_percent',
              target: 80,
              trend: 'monthly',
            },
          },
          {
            id: 'supplier-map',
            type: 'map',
            dataSource: 'suppliers',
            config: {
              showRadius: true,
              colorBy: 'product_type',
            },
          },
        ],
      },
    ],
  },
];

// Template accessor functions
export function getTemplateById(id: string): RestaurantTemplate | undefined {
  return restaurantTemplates.find(t => t.id === id);
}

export function getTemplatesByCategory(category: string): RestaurantTemplate[] {
  return restaurantTemplates.filter(t => t.category === category);
}

export function getEnabledTemplates(): RestaurantTemplate[] {
  return restaurantTemplates.filter(t => t.enabled);
}

// Template application function
export async function applyTemplate(
  templateId: string,
  config: {
    organizationId: string;
    customization?: Record<string, any>;
    enabledFeatures?: string[];
  }
): Promise<{
  success: boolean;
  appliedFeatures: string[];
  errors?: string[];
}> {
  const template = getTemplateById(templateId);
  if (!template) {
    return {
      success: false,
      appliedFeatures: [],
      errors: ['Template not found'],
    };
  }

  const appliedFeatures: string[] = [];
  const errors: string[] = [];

  try {
    // Apply configuration
    const finalConfig = {
      ...template.configuration,
      ...config.customization,
    };

    // Apply workflows
    for (const workflow of template.workflows) {
      if (!config.enabledFeatures || config.enabledFeatures.includes(workflow.id)) {
        // Workflow application logic here
        appliedFeatures.push(`workflow:${workflow.id}`);
      }
    }

    // Apply data models
    for (const model of template.dataModels) {
      // Data model application logic here
      appliedFeatures.push(`model:${model.name}`);
    }

    // Apply integrations
    for (const integration of template.integrations) {
      if (integration.enabled) {
        // Integration setup logic here
        appliedFeatures.push(`integration:${integration.type}`);
      }
    }

    // Apply alerts
    for (const alert of template.alerts) {
      // Alert configuration logic here
      appliedFeatures.push(`alert:${alert.id}`);
    }

    // Apply dashboards
    for (const dashboard of template.dashboards) {
      // Dashboard creation logic here
      appliedFeatures.push(`dashboard:${dashboard.id}`);
    }

    return {
      success: true,
      appliedFeatures,
    };
  } catch (error) {
    return {
      success: false,
      appliedFeatures,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// Template validation
export function validateTemplateConfig(
  templateId: string,
  config: Record<string, any>
): { valid: boolean; errors: string[] } {
  const template = getTemplateById(templateId);
  if (!template) {
    return { valid: false, errors: ['Template not found'] };
  }

  const errors: string[] = [];

  // Validate required configuration
  const requiredKeys = Object.keys(template.configuration);
  for (const key of requiredKeys) {
    if (!(key in config)) {
      errors.push(`Missing required configuration: ${key}`);
    }
  }

  // Validate data types
  for (const [key, value] of Object.entries(config)) {
    const templateValue = template.configuration[key];
    if (templateValue !== undefined && typeof value !== typeof templateValue) {
      errors.push(`Invalid type for ${key}: expected ${typeof templateValue}, got ${typeof value}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}