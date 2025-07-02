import { z } from 'zod';

// Customer Data Platform Engine
// Unified customer data management with real-time segmentation and journey tracking

export interface Customer {
  id: string;
  externalIds: Record<string, string>; // POS, loyalty, email platform IDs
  profile: CustomerProfile;
  segments: CustomerSegment[];
  journey: CustomerJourney;
  preferences: CustomerPreferences;
  metrics: CustomerMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerProfile {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  address?: Address;
  demographics?: Demographics;
  loyaltyStatus: 'new' | 'regular' | 'vip' | 'at_risk' | 'churned';
  marketingConsent: {
    email: boolean;
    sms: boolean;
    push: boolean;
    updatedAt: Date;
  };
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface Demographics {
  ageRange?: string;
  gender?: string;
  householdIncome?: string;
  education?: string;
  occupation?: string;
}

export interface CustomerSegment {
  id: string;
  name: string;
  type: 'behavioral' | 'demographic' | 'transactional' | 'predictive';
  rules: SegmentRule[];
  enteredAt: Date;
  confidence: number; // 0-1
}

export interface SegmentRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in' | 'between';
  value: any;
  weight?: number;
}

export interface CustomerJourney {
  stages: JourneyStage[];
  currentStage: string;
  touchpoints: Touchpoint[];
  nextBestActions: NextBestAction[];
}

export interface JourneyStage {
  id: string;
  name: string;
  enteredAt: Date;
  exitedAt?: Date;
  triggers: string[];
  objectives: string[];
}

export interface Touchpoint {
  id: string;
  timestamp: Date;
  channel: 'pos' | 'website' | 'app' | 'email' | 'sms' | 'social' | 'in_store';
  type: 'visit' | 'purchase' | 'interaction' | 'engagement' | 'support';
  details: Record<string, any>;
  value?: number;
  sentiment?: number; // -1 to 1
}

export interface NextBestAction {
  id: string;
  type: 'offer' | 'content' | 'outreach' | 'experience';
  priority: number;
  confidence: number;
  channel: string[];
  content: string;
  expiresAt?: Date;
  triggers?: string[];
}

export interface CustomerPreferences {
  dietary: string[];
  cuisine: string[];
  diningTime: string[];
  seating: string[];
  communication: {
    frequency: 'never' | 'weekly' | 'monthly' | 'special_only';
    channels: string[];
  };
  offers: {
    types: string[];
    maxDiscount?: number;
  };
}

export interface CustomerMetrics {
  totalSpend: number;
  averageOrderValue: number;
  visitFrequency: number; // visits per month
  lifetimeValue: number;
  predictedValue: number;
  churnRisk: number; // 0-1
  satisfaction: number; // 1-5
  referrals: number;
  lastVisit: Date;
  recency: number; // days since last visit
  monetary: number; // total spend category
  frequency: number; // visit frequency category
}

// CDP Engine Configuration
export interface CDPConfig {
  dataSources: DataSourceConfig[];
  segmentationRules: SegmentationConfig[];
  journeyMaps: JourneyMapConfig[];
  automations: AutomationConfig[];
  integrations: IntegrationConfig[];
  privacy: PrivacyConfig;
}

export interface DataSourceConfig {
  id: string;
  name: string;
  type: 'pos' | 'loyalty' | 'email' | 'website' | 'app' | 'survey' | 'social';
  connection: Record<string, any>;
  mappings: FieldMapping[];
  syncSchedule: string; // cron expression
  enabled: boolean;
}

export interface FieldMapping {
  source: string;
  target: string;
  transform?: string;
  required: boolean;
}

export interface SegmentationConfig {
  id: string;
  name: string;
  description: string;
  rules: SegmentRule[];
  updateFrequency: 'real_time' | 'hourly' | 'daily' | 'weekly';
  actions: SegmentAction[];
}

export interface SegmentAction {
  type: 'email' | 'sms' | 'push' | 'personalization' | 'offer';
  trigger: 'on_entry' | 'on_exit' | 'periodic';
  config: Record<string, any>;
}

export interface JourneyMapConfig {
  id: string;
  name: string;
  stages: JourneyStageConfig[];
  transitions: StageTransition[];
  automations: JourneyAutomation[];
}

export interface JourneyStageConfig {
  id: string;
  name: string;
  description: string;
  entryRules: SegmentRule[];
  exitRules: SegmentRule[];
  actions: JourneyAction[];
  duration?: number; // max time in stage (days)
}

export interface StageTransition {
  from: string;
  to: string;
  conditions: SegmentRule[];
  probability?: number;
}

export interface JourneyAction {
  id: string;
  delay: number; // hours after stage entry
  type: 'message' | 'offer' | 'task' | 'webhook';
  config: Record<string, any>;
  conditions?: SegmentRule[];
}

export interface JourneyAutomation {
  trigger: 'stage_entry' | 'stage_exit' | 'stage_timeout' | 'behavior';
  conditions: SegmentRule[];
  actions: JourneyAction[];
}

export interface AutomationConfig {
  id: string;
  name: string;
  type: 'behavioral' | 'scheduled' | 'triggered';
  rules: AutomationRule[];
  actions: AutomationAction[];
  enabled: boolean;
}

export interface AutomationRule {
  event: string;
  conditions: SegmentRule[];
  frequency?: 'once' | 'daily' | 'weekly' | 'monthly';
}

export interface AutomationAction {
  type: 'send_message' | 'update_segment' | 'create_task' | 'trigger_workflow';
  config: Record<string, any>;
  delay?: number;
}

export interface IntegrationConfig {
  id: string;
  type: string;
  config: Record<string, any>;
  bidirectional: boolean;
  syncFields: string[];
  enabled: boolean;
}

export interface PrivacyConfig {
  dataRetention: number; // days
  anonymization: {
    enabled: boolean;
    fields: string[];
    delay: number; // days
  };
  consent: {
    required: boolean;
    granular: boolean;
    renewal: number; // days
  };
  deletion: {
    automated: boolean;
    criteria: SegmentRule[];
  };
}

// CDP Engine Class
export class CDPEngine {
  private config: CDPConfig;
  private customers: Map<string, Customer> = new Map();
  private segments: Map<string, CustomerSegment[]> = new Map();
  private journeys: Map<string, CustomerJourney> = new Map();

  constructor(config: CDPConfig) {
    this.config = config;
  }

  // Customer Management
  async createCustomer(data: Partial<Customer>): Promise<Customer> {
    const customer: Customer = {
      id: data.id || this.generateCustomerId(),
      externalIds: data.externalIds || {},
      profile: data.profile || this.createDefaultProfile(),
      segments: [],
      journey: data.journey || this.initializeJourney(),
      preferences: data.preferences || this.createDefaultPreferences(),
      metrics: data.metrics || this.createDefaultMetrics(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.customers.set(customer.id, customer);
    await this.processCustomerSegmentation(customer.id);
    await this.initializeCustomerJourney(customer.id);

    return customer;
  }

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer | null> {
    const customer = this.customers.get(id);
    if (!customer) return null;

    const updated = {
      ...customer,
      ...updates,
      updatedAt: new Date(),
    };

    this.customers.set(id, updated);
    await this.processCustomerSegmentation(id);
    await this.updateCustomerJourney(id);

    return updated;
  }

  async getCustomer(id: string): Promise<Customer | null> {
    return this.customers.get(id) || null;
  }

  async findCustomerByExternalId(source: string, externalId: string): Promise<Customer | null> {
    for (const customer of this.customers.values()) {
      if (customer.externalIds[source] === externalId) {
        return customer;
      }
    }
    return null;
  }

  // Segmentation
  async processCustomerSegmentation(customerId: string): Promise<void> {
    const customer = this.customers.get(customerId);
    if (!customer) return;

    const newSegments: CustomerSegment[] = [];

    for (const segmentConfig of this.config.segmentationRules) {
      const matches = await this.evaluateSegmentRules(customer, segmentConfig.rules);
      if (matches.passes) {
        newSegments.push({
          id: segmentConfig.id,
          name: segmentConfig.name,
          type: this.getSegmentType(segmentConfig),
          rules: segmentConfig.rules,
          enteredAt: new Date(),
          confidence: matches.confidence,
        });
      }
    }

    // Update customer segments
    customer.segments = newSegments;
    customer.updatedAt = new Date();

    // Trigger segment actions
    await this.triggerSegmentActions(customer, newSegments);
  }

  private async evaluateSegmentRules(
    customer: Customer,
    rules: SegmentRule[]
  ): Promise<{ passes: boolean; confidence: number }> {
    let totalWeight = 0;
    let passedWeight = 0;

    for (const rule of rules) {
      const weight = rule.weight || 1;
      totalWeight += weight;

      const value = this.getCustomerFieldValue(customer, rule.field);
      const passes = this.evaluateRule(value, rule.operator, rule.value);

      if (passes) {
        passedWeight += weight;
      }
    }

    const confidence = totalWeight > 0 ? passedWeight / totalWeight : 0;
    return {
      passes: confidence >= 0.7, // 70% threshold
      confidence,
    };
  }

  private evaluateRule(value: any, operator: string, ruleValue: any): boolean {
    switch (operator) {
      case 'equals':
        return value === ruleValue;
      case 'not_equals':
        return value !== ruleValue;
      case 'greater_than':
        return value > ruleValue;
      case 'less_than':
        return value < ruleValue;
      case 'contains':
        return String(value).includes(String(ruleValue));
      case 'in':
        return Array.isArray(ruleValue) && ruleValue.includes(value);
      case 'between':
        return Array.isArray(ruleValue) && value >= ruleValue[0] && value <= ruleValue[1];
      default:
        return false;
    }
  }

  private getCustomerFieldValue(customer: Customer, field: string): any {
    const parts = field.split('.');
    let value: any = customer;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }

  // Journey Management
  async initializeCustomerJourney(customerId: string): Promise<void> {
    const customer = this.customers.get(customerId);
    if (!customer) return;

    const journeyMap = this.config.journeyMaps[0]; // Use first journey map for now
    if (!journeyMap) return;

    const initialStage = journeyMap.stages[0];
    customer.journey = {
      stages: [{
        id: initialStage.id,
        name: initialStage.name,
        enteredAt: new Date(),
        triggers: [],
        objectives: [],
      }],
      currentStage: initialStage.id,
      touchpoints: [],
      nextBestActions: [],
    };

    await this.generateNextBestActions(customerId);
  }

  async updateCustomerJourney(customerId: string): Promise<void> {
    const customer = this.customers.get(customerId);
    if (!customer) return;

    // Check for stage transitions
    await this.checkStageTransitions(customer);
    
    // Update next best actions
    await this.generateNextBestActions(customerId);
  }

  private async checkStageTransitions(customer: Customer): Promise<void> {
    const journeyMap = this.config.journeyMaps[0];
    if (!journeyMap) return;

    const currentStage = customer.journey.currentStage;
    const transitions = journeyMap.transitions.filter(t => t.from === currentStage);

    for (const transition of transitions) {
      const matches = await this.evaluateSegmentRules(customer, transition.conditions);
      if (matches.passes) {
        // Transition to new stage
        const newStage = journeyMap.stages.find(s => s.id === transition.to);
        if (newStage) {
          // Exit current stage
          const currentStageData = customer.journey.stages.find(s => s.id === currentStage);
          if (currentStageData && !currentStageData.exitedAt) {
            currentStageData.exitedAt = new Date();
          }

          // Enter new stage
          customer.journey.stages.push({
            id: newStage.id,
            name: newStage.name,
            enteredAt: new Date(),
            triggers: [],
            objectives: [],
          });

          customer.journey.currentStage = newStage.id;
          break;
        }
      }
    }
  }

  async generateNextBestActions(customerId: string): Promise<void> {
    const customer = this.customers.get(customerId);
    if (!customer) return;

    const actions: NextBestAction[] = [];

    // Generate actions based on segments
    for (const segment of customer.segments) {
      const segmentConfig = this.config.segmentationRules.find(s => s.id === segment.id);
      if (segmentConfig) {
        for (const action of segmentConfig.actions) {
          actions.push({
            id: `${segment.id}_${action.type}_${Date.now()}`,
            type: this.mapActionType(action.type),
            priority: this.calculateActionPriority(customer, segment, action),
            confidence: segment.confidence,
            channel: [action.type],
            content: this.generateActionContent(customer, action),
          });
        }
      }
    }

    // Sort by priority and take top actions
    customer.journey.nextBestActions = actions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5);
  }

  // Data Ingestion
  async ingestData(source: string, data: any[]): Promise<void> {
    const sourceConfig = this.config.dataSources.find(ds => ds.id === source);
    if (!sourceConfig) return;

    for (const record of data) {
      const mappedData = this.mapSourceData(record, sourceConfig.mappings);
      await this.processIngestedData(source, mappedData);
    }
  }

  private mapSourceData(data: any, mappings: FieldMapping[]): any {
    const mapped: any = {};

    for (const mapping of mappings) {
      let value = data[mapping.source];

      if (mapping.transform) {
        value = this.applyTransform(value, mapping.transform);
      }

      this.setNestedValue(mapped, mapping.target, value);
    }

    return mapped;
  }

  private applyTransform(value: any, transform: string): any {
    // Simple transform functions
    switch (transform) {
      case 'lowercase':
        return String(value).toLowerCase();
      case 'uppercase':
        return String(value).toUpperCase();
      case 'date':
        return new Date(value);
      case 'number':
        return Number(value);
      case 'boolean':
        return Boolean(value);
      default:
        return value;
    }
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  // Analytics and Reporting
  async getCustomerAnalytics(): Promise<{
    totalCustomers: number;
    segmentDistribution: Record<string, number>;
    journeyStageDistribution: Record<string, number>;
    churnRisk: {
      high: number;
      medium: number;
      low: number;
    };
    lifetimeValue: {
      average: number;
      median: number;
      top10Percent: number;
    };
  }> {
    const customers = Array.from(this.customers.values());
    
    const segmentDistribution: Record<string, number> = {};
    const journeyStageDistribution: Record<string, number> = {};
    let highChurnRisk = 0;
    let mediumChurnRisk = 0;
    let lowChurnRisk = 0;
    const lifetimeValues = customers.map(c => c.metrics.lifetimeValue);

    for (const customer of customers) {
      // Segment distribution
      for (const segment of customer.segments) {
        segmentDistribution[segment.name] = (segmentDistribution[segment.name] || 0) + 1;
      }

      // Journey stage distribution
      const currentStage = customer.journey.currentStage;
      journeyStageDistribution[currentStage] = (journeyStageDistribution[currentStage] || 0) + 1;

      // Churn risk
      if (customer.metrics.churnRisk > 0.7) {
        highChurnRisk++;
      } else if (customer.metrics.churnRisk > 0.3) {
        mediumChurnRisk++;
      } else {
        lowChurnRisk++;
      }
    }

    lifetimeValues.sort((a, b) => b - a);
    const average = lifetimeValues.reduce((sum, val) => sum + val, 0) / lifetimeValues.length;
    const median = lifetimeValues[Math.floor(lifetimeValues.length / 2)];
    const top10Percent = lifetimeValues.slice(0, Math.ceil(lifetimeValues.length * 0.1))
      .reduce((sum, val) => sum + val, 0) / Math.ceil(lifetimeValues.length * 0.1);

    return {
      totalCustomers: customers.length,
      segmentDistribution,
      journeyStageDistribution,
      churnRisk: {
        high: highChurnRisk,
        medium: mediumChurnRisk,
        low: lowChurnRisk,
      },
      lifetimeValue: {
        average,
        median,
        top10Percent,
      },
    };
  }

  // Utility methods
  private generateCustomerId(): string {
    return `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createDefaultProfile(): CustomerProfile {
    return {
      loyaltyStatus: 'new',
      marketingConsent: {
        email: false,
        sms: false,
        push: false,
        updatedAt: new Date(),
      },
    };
  }

  private initializeJourney(): CustomerJourney {
    return {
      stages: [],
      currentStage: 'new',
      touchpoints: [],
      nextBestActions: [],
    };
  }

  private createDefaultPreferences(): CustomerPreferences {
    return {
      dietary: [],
      cuisine: [],
      diningTime: [],
      seating: [],
      communication: {
        frequency: 'monthly',
        channels: [],
      },
      offers: {
        types: [],
      },
    };
  }

  private createDefaultMetrics(): CustomerMetrics {
    return {
      totalSpend: 0,
      averageOrderValue: 0,
      visitFrequency: 0,
      lifetimeValue: 0,
      predictedValue: 0,
      churnRisk: 0,
      satisfaction: 3,
      referrals: 0,
      lastVisit: new Date(),
      recency: 0,
      monetary: 0,
      frequency: 0,
    };
  }

  private getSegmentType(config: SegmentationConfig): 'behavioral' | 'demographic' | 'transactional' | 'predictive' {
    // Analyze rules to determine segment type
    const hasTransactionRules = config.rules.some(r => r.field.includes('spend') || r.field.includes('order'));
    const hasBehaviorRules = config.rules.some(r => r.field.includes('visit') || r.field.includes('frequency'));
    const hasDemographicRules = config.rules.some(r => r.field.includes('age') || r.field.includes('gender'));
    
    if (hasTransactionRules) return 'transactional';
    if (hasBehaviorRules) return 'behavioral';
    if (hasDemographicRules) return 'demographic';
    return 'predictive';
  }

  private async triggerSegmentActions(customer: Customer, segments: CustomerSegment[]): Promise<void> {
    // Implementation for triggering segment-based actions
    for (const segment of segments) {
      const config = this.config.segmentationRules.find(s => s.id === segment.id);
      if (config) {
        for (const action of config.actions) {
          if (action.trigger === 'on_entry') {
            await this.executeSegmentAction(customer, action);
          }
        }
      }
    }
  }

  private async executeSegmentAction(customer: Customer, action: SegmentAction): Promise<void> {
    // Implementation for executing segment actions
    console.log(`Executing ${action.type} action for customer ${customer.id}`);
  }

  private mapActionType(type: string): 'offer' | 'content' | 'outreach' | 'experience' {
    switch (type) {
      case 'email':
      case 'sms':
      case 'push':
        return 'outreach';
      case 'offer':
        return 'offer';
      case 'personalization':
        return 'experience';
      default:
        return 'content';
    }
  }

  private calculateActionPriority(customer: Customer, segment: CustomerSegment, action: SegmentAction): number {
    let priority = segment.confidence * 100; // Base priority on segment confidence
    
    // Adjust based on customer metrics
    if (customer.metrics.churnRisk > 0.7) priority += 50; // High churn risk
    if (customer.metrics.lifetimeValue > 1000) priority += 30; // High-value customer
    if (customer.metrics.recency > 30) priority += 20; // Haven't visited recently
    
    return Math.min(priority, 100);
  }

  private generateActionContent(customer: Customer, action: SegmentAction): string {
    // Generate personalized content based on customer data
    return `Personalized ${action.type} content for ${customer.profile.firstName || 'valued customer'}`;
  }

  private async processIngestedData(source: string, data: any): Promise<void> {
    // Process ingested data and update customer records
    const customerId = data.customerId || data.id;
    if (customerId) {
      const customer = await this.getCustomer(customerId);
      if (customer) {
        await this.updateCustomer(customerId, data);
      } else {
        await this.createCustomer(data);
      }
    }
  }
}