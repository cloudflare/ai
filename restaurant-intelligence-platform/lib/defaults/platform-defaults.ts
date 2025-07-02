import { z } from 'zod';

// Platform Defaults and Smart Configuration
// Production-ready defaults that work out of the box for most restaurant operations

export interface PlatformDefaults {
  organization: OrganizationDefaults;
  integrations: IntegrationDefaults;
  analytics: AnalyticsDefaults;
  alerts: AlertDefaults;
  automation: AutomationDefaults;
  dashboard: DashboardDefaults;
  reporting: ReportingDefaults;
  security: SecurityDefaults;
}

export interface OrganizationDefaults {
  timezone: string;
  currency: string;
  dateFormat: string;
  weekStartDay: 'monday' | 'sunday';
  businessHours: {
    [key: string]: {
      open: string;
      close: string;
      closed?: boolean;
    };
  };
  operatingHours: {
    breakfast: { start: string; end: string };
    lunch: { start: string; end: string };
    dinner: { start: string; end: string };
    lateNight: { start: string; end: string };
  };
}

export interface IntegrationDefaults {
  pos: PosDefaults;
  payment: PaymentDefaults;
  loyalty: LoyaltyDefaults;
  inventory: InventoryDefaults;
  scheduling: SchedulingDefaults;
  accounting: AccountingDefaults;
}

export interface PosDefaults {
  syncInterval: number; // minutes
  retryAttempts: number;
  batchSize: number;
  enabledEndpoints: string[];
  dataRetention: number; // days
  realTimeSync: boolean;
}

export interface PaymentDefaults {
  providers: string[];
  processingFee: number;
  settlementTime: number; // hours
  enableTips: boolean;
  tipSuggestions: number[];
}

export interface LoyaltyDefaults {
  pointsPerDollar: number;
  redemptionThreshold: number;
  tierThresholds: { name: string; minSpend: number }[];
  expirationMonths: number;
}

export interface InventoryDefaults {
  reorderPoints: {
    dry: number; // percentage of par
    refrigerated: number;
    frozen: number;
    beverage: number;
  };
  countFrequency: {
    high: number; // days
    medium: number;
    low: number;
  };
  wastageThreshold: number; // percentage
}

export interface SchedulingDefaults {
  scheduleHorizon: number; // weeks
  minimumShift: number; // hours
  maximumShift: number; // hours
  breakDuration: number; // minutes
  overtimeThreshold: number; // hours
}

export interface AccountingDefaults {
  fiscalYearStart: string; // MM-DD
  taxRates: { name: string; rate: number }[];
  expenseCategories: string[];
  depreciationRates: { category: string; rate: number }[];
}

export interface AnalyticsDefaults {
  metrics: MetricDefaults[];
  kpis: KpiDefaults[];
  benchmarks: BenchmarkDefaults;
  forecasting: ForecastingDefaults;
}

export interface MetricDefaults {
  name: string;
  category: string;
  formula: string;
  unit: string;
  target?: number;
  format: 'number' | 'percentage' | 'currency' | 'duration';
  trend: 'higher_better' | 'lower_better' | 'neutral';
  updateFrequency: 'real_time' | 'hourly' | 'daily' | 'weekly';
}

export interface KpiDefaults {
  name: string;
  description: string;
  calculation: string;
  target: number;
  warning: number;
  critical: number;
  industry: string;
}

export interface BenchmarkDefaults {
  industry: {
    [key: string]: {
      p25: number;
      p50: number;
      p75: number;
      p90: number;
    };
  };
  regional: {
    [key: string]: number;
  };
}

export interface ForecastingDefaults {
  models: string[];
  seasonality: boolean;
  holidays: boolean;
  events: boolean;
  weather: boolean;
  horizon: number; // days
  confidence: number; // 0-1
}

export interface AlertDefaults {
  channels: AlertChannelDefaults;
  rules: AlertRuleDefaults[];
  escalation: EscalationDefaults;
  suppression: SuppressionDefaults;
}

export interface AlertChannelDefaults {
  email: {
    enabled: boolean;
    templates: { [key: string]: string };
    rateLimit: number; // per hour
  };
  sms: {
    enabled: boolean;
    templates: { [key: string]: string };
    rateLimit: number;
  };
  push: {
    enabled: boolean;
    sound: boolean;
    badge: boolean;
  };
  slack: {
    enabled: boolean;
    webhook?: string;
    channel?: string;
  };
}

export interface AlertRuleDefaults {
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: string[];
  businessHoursOnly: boolean;
  cooldown: number; // minutes
}

export interface EscalationDefaults {
  enabled: boolean;
  levels: {
    delay: number; // minutes
    recipients: string[];
    channels: string[];
  }[];
}

export interface SuppressionDefaults {
  duplicateWindow: number; // minutes
  maintenanceMode: boolean;
  quietHours: {
    start: string;
    end: string;
  };
}

export interface AutomationDefaults {
  workflows: WorkflowDefaults[];
  triggers: TriggerDefaults[];
  actions: ActionDefaults[];
  schedules: ScheduleDefaults[];
}

export interface WorkflowDefaults {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  triggers: string[];
  actions: string[];
  conditions: string[];
}

export interface TriggerDefaults {
  type: string;
  enabled: boolean;
  config: Record<string, any>;
  conditions: Record<string, any>;
}

export interface ActionDefaults {
  type: string;
  enabled: boolean;
  config: Record<string, any>;
  retryPolicy: {
    maxAttempts: number;
    backoffStrategy: string;
    baseDelay: number;
  };
}

export interface ScheduleDefaults {
  type: 'cron' | 'interval';
  expression: string;
  timezone: string;
  enabled: boolean;
}

export interface DashboardDefaults {
  layouts: DashboardLayoutDefaults[];
  widgets: WidgetDefaults[];
  themes: ThemeDefaults[];
  preferences: DashboardPreferences;
}

export interface DashboardLayoutDefaults {
  name: string;
  description: string;
  role: string;
  widgets: {
    id: string;
    position: { x: number; y: number; w: number; h: number };
  }[];
}

export interface WidgetDefaults {
  id: string;
  name: string;
  type: string;
  category: string;
  dataSource: string;
  config: Record<string, any>;
  refreshInterval: number;
}

export interface ThemeDefaults {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
  typography: {
    fontFamily: string;
    fontSize: {
      small: string;
      medium: string;
      large: string;
    };
  };
}

export interface DashboardPreferences {
  autoRefresh: boolean;
  refreshInterval: number;
  showTooltips: boolean;
  compactMode: boolean;
  darkMode: boolean;
}

export interface ReportingDefaults {
  schedules: ReportScheduleDefaults[];
  templates: ReportTemplateDefaults[];
  delivery: ReportDeliveryDefaults;
  retention: ReportRetentionDefaults;
}

export interface ReportScheduleDefaults {
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  format: 'pdf' | 'excel' | 'csv' | 'json';
  recipients: string[];
  enabled: boolean;
}

export interface ReportTemplateDefaults {
  name: string;
  category: string;
  sections: string[];
  filters: Record<string, any>;
  charts: string[];
}

export interface ReportDeliveryDefaults {
  email: {
    enabled: boolean;
    subject: string;
    body: string;
  };
  cloud: {
    enabled: boolean;
    provider: string;
    bucket: string;
    path: string;
  };
}

export interface ReportRetentionDefaults {
  daily: number; // days
  weekly: number;
  monthly: number;
  quarterly: number;
}

export interface SecurityDefaults {
  authentication: AuthenticationDefaults;
  authorization: AuthorizationDefaults;
  encryption: EncryptionDefaults;
  audit: AuditDefaults;
  compliance: ComplianceDefaults;
}

export interface AuthenticationDefaults {
  methods: string[];
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    expirationDays: number;
  };
  sessionTimeout: number; // minutes
  mfaRequired: boolean;
}

export interface AuthorizationDefaults {
  roles: RoleDefaults[];
  permissions: PermissionDefaults[];
  accessControl: AccessControlDefaults;
}

export interface RoleDefaults {
  name: string;
  description: string;
  permissions: string[];
  inherits: string[];
}

export interface PermissionDefaults {
  name: string;
  resource: string;
  actions: string[];
  conditions: Record<string, any>;
}

export interface AccessControlDefaults {
  ipWhitelist: string[];
  geoRestrictions: string[];
  timeRestrictions: {
    start: string;
    end: string;
    timezone: string;
  };
}

export interface EncryptionDefaults {
  algorithm: string;
  keyLength: number;
  rotationPeriod: number; // days
  atRest: boolean;
  inTransit: boolean;
}

export interface AuditDefaults {
  enabled: boolean;
  events: string[];
  retention: number; // days
  storage: {
    type: string;
    location: string;
    encryption: boolean;
  };
}

export interface ComplianceDefaults {
  standards: string[];
  dataRetention: {
    customer: number; // days
    transaction: number;
    employee: number;
    audit: number;
  };
  privacy: {
    anonymization: boolean;
    rightToForget: boolean;
    consentManagement: boolean;
  };
}

// Production-Ready Platform Defaults
export const productionDefaults: PlatformDefaults = {
  organization: {
    timezone: 'America/New_York',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    weekStartDay: 'sunday',
    businessHours: {
      monday: { open: '11:00', close: '22:00' },
      tuesday: { open: '11:00', close: '22:00' },
      wednesday: { open: '11:00', close: '22:00' },
      thursday: { open: '11:00', close: '22:00' },
      friday: { open: '11:00', close: '23:00' },
      saturday: { open: '10:00', close: '23:00' },
      sunday: { open: '10:00', close: '22:00' },
    },
    operatingHours: {
      breakfast: { start: '06:00', end: '11:00' },
      lunch: { start: '11:00', end: '16:00' },
      dinner: { start: '16:00', end: '22:00' },
      lateNight: { start: '22:00', end: '02:00' },
    },
  },
  integrations: {
    pos: {
      syncInterval: 15, // 15 minutes
      retryAttempts: 3,
      batchSize: 1000,
      enabledEndpoints: ['orders', 'payments', 'customers', 'inventory'],
      dataRetention: 365, // 1 year
      realTimeSync: true,
    },
    payment: {
      providers: ['stripe', 'square', 'toast'],
      processingFee: 2.9,
      settlementTime: 24,
      enableTips: true,
      tipSuggestions: [15, 18, 20, 25],
    },
    loyalty: {
      pointsPerDollar: 1,
      redemptionThreshold: 100,
      tierThresholds: [
        { name: 'Bronze', minSpend: 0 },
        { name: 'Silver', minSpend: 500 },
        { name: 'Gold', minSpend: 1500 },
        { name: 'Platinum', minSpend: 3000 },
      ],
      expirationMonths: 24,
    },
    inventory: {
      reorderPoints: {
        dry: 25, // 25% of par
        refrigerated: 30,
        frozen: 20,
        beverage: 15,
      },
      countFrequency: {
        high: 1, // daily
        medium: 3, // every 3 days
        low: 7, // weekly
      },
      wastageThreshold: 5, // 5%
    },
    scheduling: {
      scheduleHorizon: 3, // 3 weeks
      minimumShift: 4, // 4 hours
      maximumShift: 10, // 10 hours
      breakDuration: 30, // 30 minutes
      overtimeThreshold: 40, // 40 hours per week
    },
    accounting: {
      fiscalYearStart: '01-01',
      taxRates: [
        { name: 'Sales Tax', rate: 8.25 },
        { name: 'Service Tax', rate: 5.0 },
      ],
      expenseCategories: [
        'Food & Beverage',
        'Labor',
        'Rent',
        'Utilities',
        'Marketing',
        'Equipment',
        'Supplies',
        'Insurance',
        'Professional Services',
        'Other',
      ],
      depreciationRates: [
        { category: 'Kitchen Equipment', rate: 7 },
        { category: 'POS Systems', rate: 5 },
        { category: 'Furniture', rate: 10 },
        { category: 'Vehicles', rate: 5 },
      ],
    },
  },
  analytics: {
    metrics: [
      {
        name: 'Revenue',
        category: 'Financial',
        formula: 'SUM(order_total)',
        unit: 'USD',
        format: 'currency',
        trend: 'higher_better',
        updateFrequency: 'real_time',
      },
      {
        name: 'Average Check Size',
        category: 'Financial',
        formula: 'AVG(order_total)',
        unit: 'USD',
        format: 'currency',
        trend: 'higher_better',
        updateFrequency: 'hourly',
      },
      {
        name: 'Customer Count',
        category: 'Operational',
        formula: 'COUNT(DISTINCT customer_id)',
        unit: 'customers',
        format: 'number',
        trend: 'higher_better',
        updateFrequency: 'real_time',
      },
      {
        name: 'Table Turnover',
        category: 'Operational',
        formula: 'total_covers / available_seats',
        unit: 'turns',
        format: 'number',
        trend: 'higher_better',
        updateFrequency: 'hourly',
      },
      {
        name: 'Food Cost %',
        category: 'Financial',
        formula: '(food_cost / food_revenue) * 100',
        unit: '%',
        target: 28,
        format: 'percentage',
        trend: 'lower_better',
        updateFrequency: 'daily',
      },
      {
        name: 'Labor Cost %',
        category: 'Financial',
        formula: '(labor_cost / total_revenue) * 100',
        unit: '%',
        target: 30,
        format: 'percentage',
        trend: 'lower_better',
        updateFrequency: 'daily',
      },
    ],
    kpis: [
      {
        name: 'Revenue per Available Seat Hour (RevPASH)',
        description: 'Revenue generated per seat per hour',
        calculation: 'total_revenue / (seats * operating_hours)',
        target: 25,
        warning: 20,
        critical: 15,
        industry: 'Full Service Restaurant',
      },
      {
        name: 'Customer Acquisition Cost (CAC)',
        description: 'Cost to acquire a new customer',
        calculation: 'marketing_spend / new_customers',
        target: 15,
        warning: 20,
        critical: 25,
        industry: 'All',
      },
    ],
    benchmarks: {
      industry: {
        'food_cost_percent': { p25: 25, p50: 28, p75: 32, p90: 36 },
        'labor_cost_percent': { p25: 25, p50: 30, p75: 35, p90: 40 },
        'profit_margin': { p25: 3, p50: 6, p75: 10, p90: 15 },
        'table_turnover': { p25: 1.5, p50: 2.0, p75: 2.5, p90: 3.0 },
      },
      regional: {
        'average_check': 45,
        'minimum_wage': 15,
        'rent_per_sqft': 35,
      },
    },
    forecasting: {
      models: ['seasonal_arima', 'prophet', 'linear_regression'],
      seasonality: true,
      holidays: true,
      events: true,
      weather: true,
      horizon: 90,
      confidence: 0.95,
    },
  },
  alerts: {
    channels: {
      email: {
        enabled: true,
        templates: {
          critical: 'Critical Alert: {{title}} - {{description}}',
          warning: 'Warning: {{title}} - {{description}}',
          info: 'Info: {{title}} - {{description}}',
        },
        rateLimit: 10,
      },
      sms: {
        enabled: true,
        templates: {
          critical: 'CRITICAL: {{title}}',
          warning: 'WARNING: {{title}}',
        },
        rateLimit: 5,
      },
      push: {
        enabled: true,
        sound: true,
        badge: true,
      },
      slack: {
        enabled: false,
      },
    },
    rules: [
      {
        name: 'High Food Cost Alert',
        metric: 'food_cost_percent',
        condition: '>',
        threshold: 35,
        severity: 'high',
        channels: ['email', 'push'],
        businessHoursOnly: false,
        cooldown: 60,
      },
      {
        name: 'Low Revenue Alert',
        metric: 'hourly_revenue',
        condition: '<',
        threshold: 500,
        severity: 'medium',
        channels: ['email'],
        businessHoursOnly: true,
        cooldown: 120,
      },
      {
        name: 'POS System Down',
        metric: 'pos_uptime',
        condition: '<',
        threshold: 0.99,
        severity: 'critical',
        channels: ['email', 'sms', 'push'],
        businessHoursOnly: false,
        cooldown: 5,
      },
    ],
    escalation: {
      enabled: true,
      levels: [
        {
          delay: 15,
          recipients: ['manager'],
          channels: ['email'],
        },
        {
          delay: 30,
          recipients: ['district_manager'],
          channels: ['email', 'sms'],
        },
        {
          delay: 60,
          recipients: ['regional_director'],
          channels: ['email', 'sms'],
        },
      ],
    },
    suppression: {
      duplicateWindow: 15,
      maintenanceMode: false,
      quietHours: {
        start: '23:00',
        end: '07:00',
      },
    },
  },
  automation: {
    workflows: [
      {
        name: 'Daily Sales Report',
        description: 'Automated daily sales summary',
        category: 'reporting',
        enabled: true,
        triggers: ['daily_close'],
        actions: ['generate_report', 'send_email'],
        conditions: ['business_day'],
      },
      {
        name: 'Inventory Reorder',
        description: 'Automated inventory reordering',
        category: 'operations',
        enabled: true,
        triggers: ['low_stock'],
        actions: ['generate_po', 'notify_manager'],
        conditions: ['below_reorder_point'],
      },
    ],
    triggers: [
      {
        type: 'schedule',
        enabled: true,
        config: { cron: '0 23 * * *' }, // Daily at 11 PM
        conditions: {},
      },
      {
        type: 'metric_threshold',
        enabled: true,
        config: { metric: 'inventory_level', threshold: 0.25 },
        conditions: { operator: 'less_than' },
      },
    ],
    actions: [
      {
        type: 'email',
        enabled: true,
        config: {
          template: 'default',
          recipients: ['manager@restaurant.com'],
        },
        retryPolicy: {
          maxAttempts: 3,
          backoffStrategy: 'exponential',
          baseDelay: 1000,
        },
      },
      {
        type: 'webhook',
        enabled: true,
        config: {
          url: 'https://api.supplier.com/orders',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        retryPolicy: {
          maxAttempts: 5,
          backoffStrategy: 'linear',
          baseDelay: 2000,
        },
      },
    ],
    schedules: [
      {
        type: 'cron',
        expression: '0 9 * * MON',
        timezone: 'America/New_York',
        enabled: true,
      },
      {
        type: 'interval',
        expression: '300000', // 5 minutes
        timezone: 'America/New_York',
        enabled: true,
      },
    ],
  },
  dashboard: {
    layouts: [
      {
        name: 'Manager Dashboard',
        description: 'Primary dashboard for restaurant managers',
        role: 'manager',
        widgets: [
          { id: 'revenue_today', position: { x: 0, y: 0, w: 6, h: 4 } },
          { id: 'customer_count', position: { x: 6, y: 0, w: 6, h: 4 } },
          { id: 'hourly_sales', position: { x: 0, y: 4, w: 12, h: 6 } },
          { id: 'top_items', position: { x: 0, y: 10, w: 6, h: 6 } },
          { id: 'staff_schedule', position: { x: 6, y: 10, w: 6, h: 6 } },
        ],
      },
      {
        name: 'Executive Dashboard',
        description: 'High-level overview for executives',
        role: 'executive',
        widgets: [
          { id: 'kpi_summary', position: { x: 0, y: 0, w: 12, h: 4 } },
          { id: 'location_performance', position: { x: 0, y: 4, w: 8, h: 8 } },
          { id: 'profit_loss', position: { x: 8, y: 4, w: 4, h: 8 } },
        ],
      },
    ],
    widgets: [
      {
        id: 'revenue_today',
        name: 'Today\'s Revenue',
        type: 'metric',
        category: 'financial',
        dataSource: 'pos.sales',
        config: {
          metric: 'revenue',
          timeframe: 'today',
          comparison: 'yesterday',
          format: 'currency',
        },
        refreshInterval: 300, // 5 minutes
      },
      {
        id: 'hourly_sales',
        name: 'Hourly Sales Trend',
        type: 'line_chart',
        category: 'operational',
        dataSource: 'pos.sales',
        config: {
          metric: 'revenue',
          groupBy: 'hour',
          timeframe: 'today',
          showComparison: true,
        },
        refreshInterval: 300,
      },
    ],
    themes: [
      {
        name: 'Default Light',
        colors: {
          primary: '#3b82f6',
          secondary: '#64748b',
          accent: '#10b981',
          background: '#ffffff',
          surface: '#f8fafc',
          text: '#1e293b',
        },
        typography: {
          fontFamily: 'Inter, sans-serif',
          fontSize: {
            small: '0.875rem',
            medium: '1rem',
            large: '1.125rem',
          },
        },
      },
      {
        name: 'Dark Mode',
        colors: {
          primary: '#60a5fa',
          secondary: '#94a3b8',
          accent: '#34d399',
          background: '#0f172a',
          surface: '#1e293b',
          text: '#f1f5f9',
        },
        typography: {
          fontFamily: 'Inter, sans-serif',
          fontSize: {
            small: '0.875rem',
            medium: '1rem',
            large: '1.125rem',
          },
        },
      },
    ],
    preferences: {
      autoRefresh: true,
      refreshInterval: 300,
      showTooltips: true,
      compactMode: false,
      darkMode: false,
    },
  },
  reporting: {
    schedules: [
      {
        name: 'Daily Sales Summary',
        frequency: 'daily',
        format: 'pdf',
        recipients: ['manager@restaurant.com'],
        enabled: true,
      },
      {
        name: 'Weekly P&L Report',
        frequency: 'weekly',
        format: 'excel',
        recipients: ['finance@restaurant.com', 'owner@restaurant.com'],
        enabled: true,
      },
      {
        name: 'Monthly Executive Summary',
        frequency: 'monthly',
        format: 'pdf',
        recipients: ['executive@restaurant.com'],
        enabled: true,
      },
    ],
    templates: [
      {
        name: 'Sales Performance Report',
        category: 'operations',
        sections: ['summary', 'trends', 'items', 'staff'],
        filters: { timeframe: 'month', location: 'all' },
        charts: ['revenue_trend', 'item_performance', 'hourly_distribution'],
      },
      {
        name: 'Financial Statement',
        category: 'finance',
        sections: ['income', 'expenses', 'profit_loss', 'cash_flow'],
        filters: { period: 'month', breakdown: 'category' },
        charts: ['expense_breakdown', 'profit_trend', 'margin_analysis'],
      },
    ],
    delivery: {
      email: {
        enabled: true,
        subject: '[Restaurant] {{report_name}} - {{date}}',
        body: 'Please find the attached {{report_name}} for {{date}}.',
      },
      cloud: {
        enabled: false,
        provider: 's3',
        bucket: 'restaurant-reports',
        path: 'reports/{{year}}/{{month}}/',
      },
    },
    retention: {
      daily: 90,
      weekly: 365,
      monthly: 2555, // 7 years
      quarterly: 2555,
    },
  },
  security: {
    authentication: {
      methods: ['password', 'sso'],
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        expirationDays: 90,
      },
      sessionTimeout: 480, // 8 hours
      mfaRequired: false,
    },
    authorization: {
      roles: [
        {
          name: 'Admin',
          description: 'Full system access',
          permissions: ['*'],
          inherits: [],
        },
        {
          name: 'Manager',
          description: 'Restaurant management access',
          permissions: [
            'dashboard.view',
            'reports.view',
            'analytics.view',
            'staff.manage',
            'inventory.manage',
          ],
          inherits: ['Staff'],
        },
        {
          name: 'Staff',
          description: 'Basic operational access',
          permissions: [
            'pos.operate',
            'orders.view',
            'customers.view',
            'schedule.view',
          ],
          inherits: [],
        },
      ],
      permissions: [
        {
          name: 'dashboard.view',
          resource: 'dashboard',
          actions: ['read'],
          conditions: {},
        },
        {
          name: 'reports.view',
          resource: 'reports',
          actions: ['read'],
          conditions: { location: 'own' },
        },
      ],
      accessControl: {
        ipWhitelist: [],
        geoRestrictions: [],
        timeRestrictions: {
          start: '05:00',
          end: '02:00',
          timezone: 'America/New_York',
        },
      },
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      keyLength: 256,
      rotationPeriod: 90,
      atRest: true,
      inTransit: true,
    },
    audit: {
      enabled: true,
      events: [
        'login',
        'logout',
        'data_access',
        'data_modification',
        'admin_action',
        'configuration_change',
      ],
      retention: 2555, // 7 years
      storage: {
        type: 'database',
        location: 'primary',
        encryption: true,
      },
    },
    compliance: {
      standards: ['PCI-DSS', 'SOC2', 'GDPR'],
      dataRetention: {
        customer: 2555, // 7 years
        transaction: 2555,
        employee: 2555,
        audit: 2555,
      },
      privacy: {
        anonymization: true,
        rightToForget: true,
        consentManagement: true,
      },
    },
  },
};

// Utility functions for working with defaults
export class PlatformDefaultsManager {
  private defaults: PlatformDefaults;

  constructor(defaults: PlatformDefaults = productionDefaults) {
    this.defaults = defaults;
  }

  // Get defaults for a specific category
  getDefaults<T extends keyof PlatformDefaults>(category: T): PlatformDefaults[T] {
    return this.defaults[category];
  }

  // Override defaults with custom values
  override(overrides: Partial<PlatformDefaults>): PlatformDefaults {
    return this.deepMerge(this.defaults, overrides);
  }

  // Get defaults for a specific restaurant type
  getRestaurantTypeDefaults(type: 'qsr' | 'casual' | 'fine_dining' | 'fast_casual'): Partial<PlatformDefaults> {
    const baseDefaults = { ...this.defaults };

    switch (type) {
      case 'qsr':
        return {
          ...baseDefaults,
          organization: {
            ...baseDefaults.organization,
            businessHours: {
              monday: { open: '06:00', close: '23:00' },
              tuesday: { open: '06:00', close: '23:00' },
              wednesday: { open: '06:00', close: '23:00' },
              thursday: { open: '06:00', close: '23:00' },
              friday: { open: '06:00', close: '24:00' },
              saturday: { open: '06:00', close: '24:00' },
              sunday: { open: '07:00', close: '23:00' },
            },
          },
          analytics: {
            ...baseDefaults.analytics,
            metrics: [
              ...baseDefaults.analytics.metrics,
              {
                name: 'Speed of Service',
                category: 'Operational',
                formula: 'AVG(order_completion_time)',
                unit: 'seconds',
                target: 180,
                format: 'duration',
                trend: 'lower_better',
                updateFrequency: 'real_time',
              },
            ],
          },
        };

      case 'fine_dining':
        return {
          ...baseDefaults,
          organization: {
            ...baseDefaults.organization,
            businessHours: {
              monday: { closed: true, open: '', close: '' },
              tuesday: { open: '17:00', close: '22:00' },
              wednesday: { open: '17:00', close: '22:00' },
              thursday: { open: '17:00', close: '22:00' },
              friday: { open: '17:00', close: '23:00' },
              saturday: { open: '17:00', close: '23:00' },
              sunday: { open: '17:00', close: '21:00' },
            },
          },
          analytics: {
            ...baseDefaults.analytics,
            metrics: [
              ...baseDefaults.analytics.metrics,
              {
                name: 'Wine Sales %',
                category: 'Financial',
                formula: '(wine_revenue / total_revenue) * 100',
                unit: '%',
                target: 25,
                format: 'percentage',
                trend: 'higher_better',
                updateFrequency: 'daily',
              },
            ],
          },
        };

      case 'fast_casual':
      case 'casual':
      default:
        return baseDefaults;
    }
  }

  // Get defaults based on restaurant size
  getRestaurantSizeDefaults(size: 'small' | 'medium' | 'large' | 'enterprise'): Partial<PlatformDefaults> {
    const baseDefaults = { ...this.defaults };

    switch (size) {
      case 'small': // 1-3 locations
        return {
          ...baseDefaults,
          integrations: {
            ...baseDefaults.integrations,
            pos: {
              ...baseDefaults.integrations.pos,
              syncInterval: 30, // Less frequent for smaller operations
              batchSize: 500,
            },
          },
          reporting: {
            ...baseDefaults.reporting,
            schedules: baseDefaults.reporting.schedules.filter(
              schedule => schedule.frequency !== 'quarterly'
            ),
          },
        };

      case 'medium': // 4-10 locations
        return baseDefaults;

      case 'large': // 11-50 locations
        return {
          ...baseDefaults,
          integrations: {
            ...baseDefaults.integrations,
            pos: {
              ...baseDefaults.integrations.pos,
              syncInterval: 5, // More frequent for larger operations
              batchSize: 2000,
            },
          },
        };

      case 'enterprise': // 50+ locations
        return {
          ...baseDefaults,
          integrations: {
            ...baseDefaults.integrations,
            pos: {
              ...baseDefaults.integrations.pos,
              syncInterval: 1, // Real-time for enterprise
              batchSize: 5000,
              realTimeSync: true,
            },
          },
          security: {
            ...baseDefaults.security,
            authentication: {
              ...baseDefaults.security.authentication,
              mfaRequired: true,
              sessionTimeout: 240, // 4 hours for enterprise
            },
          },
        };

      default:
        return baseDefaults;
    }
  }

  // Apply regional defaults
  getRegionalDefaults(region: 'us' | 'ca' | 'eu' | 'uk'): Partial<PlatformDefaults> {
    const baseDefaults = { ...this.defaults };

    switch (region) {
      case 'ca':
        return {
          ...baseDefaults,
          organization: {
            ...baseDefaults.organization,
            currency: 'CAD',
            timezone: 'America/Toronto',
          },
          integrations: {
            ...baseDefaults.integrations,
            accounting: {
              ...baseDefaults.integrations.accounting,
              taxRates: [
                { name: 'GST', rate: 5 },
                { name: 'PST', rate: 7 }, // Varies by province
              ],
            },
          },
        };

      case 'eu':
        return {
          ...baseDefaults,
          organization: {
            ...baseDefaults.organization,
            currency: 'EUR',
            timezone: 'Europe/Berlin',
            dateFormat: 'DD/MM/YYYY',
            weekStartDay: 'monday',
          },
          integrations: {
            ...baseDefaults.integrations,
            accounting: {
              ...baseDefaults.integrations.accounting,
              taxRates: [
                { name: 'VAT', rate: 19 }, // Germany standard rate
              ],
            },
          },
          security: {
            ...baseDefaults.security,
            compliance: {
              ...baseDefaults.security.compliance,
              standards: ['GDPR', 'ISO27001'],
            },
          },
        };

      case 'uk':
        return {
          ...baseDefaults,
          organization: {
            ...baseDefaults.organization,
            currency: 'GBP',
            timezone: 'Europe/London',
            dateFormat: 'DD/MM/YYYY',
          },
          integrations: {
            ...baseDefaults.integrations,
            accounting: {
              ...baseDefaults.integrations.accounting,
              taxRates: [
                { name: 'VAT', rate: 20 },
              ],
            },
          },
        };

      case 'us':
      default:
        return baseDefaults;
    }
  }

  // Validate defaults configuration
  validate(config: Partial<PlatformDefaults>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate organization settings
    if (config.organization) {
      const org = config.organization;
      if (org.businessHours) {
        Object.entries(org.businessHours).forEach(([day, hours]) => {
          if (!hours.closed && (!hours.open || !hours.close)) {
            errors.push(`Invalid business hours for ${day}: must specify open and close times`);
          }
        });
      }
    }

    // Validate alert rules
    if (config.alerts?.rules) {
      config.alerts.rules.forEach((rule, index) => {
        if (!rule.name || !rule.metric || !rule.condition || rule.threshold === undefined) {
          errors.push(`Invalid alert rule at index ${index}: missing required fields`);
        }
      });
    }

    // Validate integration settings
    if (config.integrations?.pos) {
      const pos = config.integrations.pos;
      if (pos.syncInterval && pos.syncInterval < 1) {
        errors.push('POS sync interval must be at least 1 minute');
      }
      if (pos.batchSize && pos.batchSize < 1) {
        errors.push('POS batch size must be at least 1');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Deep merge utility
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  // Export configuration as JSON
  export(): string {
    return JSON.stringify(this.defaults, null, 2);
  }

  // Import configuration from JSON
  import(config: string): PlatformDefaults {
    try {
      const parsed = JSON.parse(config);
      const validation = this.validate(parsed);
      
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }
      
      return parsed;
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error}`);
    }
  }
}