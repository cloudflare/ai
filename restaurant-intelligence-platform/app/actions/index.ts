'use server';

import { z } from 'zod';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';

// Import services
import { AIService } from '@/lib/ai/ai-service';
import { SchemaTransformationEngine } from '@/lib/schemas/transformation-engine';
import { TRIZWorkflowGenerator } from '@/lib/workflows/triz-workflow-generator';
import { KnowledgeGraphBuilder } from '@/lib/analytics/knowledge-graph-builder';
import { DataCanonicalizer } from '@/lib/utils/data-canonicalizer';
import { ToastIntegration } from '@/lib/integrations/toast-integration';
import { OpenTableIntegration } from '@/lib/integrations/opentable-integration';
import { SevenShiftsIntegration } from '@/lib/integrations/7shifts-integration';

// Import database clients
import { runQuery, runTransaction } from '@/lib/db/neo4j';
import { supabase, supabaseAdmin } from '@/lib/db/supabase';
import { executeQuery } from '@/lib/db/snowflake';

// Import types
import {
  SchemaFormat,
  RestaurantPlatform,
  Workflow,
  Alert,
  Metric,
  AnalyticsEvent,
} from '@/lib/types';

// Initialize services
const aiService = new AIService({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

const schemaEngine = new SchemaTransformationEngine();
const workflowGenerator = new TRIZWorkflowGenerator();
const graphBuilder = new KnowledgeGraphBuilder(aiService);
const canonicalizer = new DataCanonicalizer();

// ==================== Schema Transformation Actions ====================

export async function transformSchema(
  sourceFormat: SchemaFormat,
  targetFormat: SchemaFormat,
  schema: string,
  options?: {
    validateSchema?: boolean;
    preserveComments?: boolean;
    formatting?: {
      indent?: number;
      lineWidth?: number;
    };
    namingConvention?: 'camelCase' | 'snake_case' | 'PascalCase';
  }
) {
  try {
    const result = await schemaEngine.transform(
      sourceFormat,
      targetFormat,
      schema,
      options
    );
    
    return { success: true, data: result };
  } catch (error) {
    console.error('Schema transformation error:', error);
    return { success: false, error: error.message };
  }
}

export async function getSchemaTemplates(platform: RestaurantPlatform) {
  const templates = schemaEngine.getRestaurantSchemaTemplates();
  return templates[platform] || null;
}

// ==================== Workflow Generation Actions ====================

export async function generateWorkflow(requirements: {
  goal: string;
  dataSources: string[];
  constraints?: {
    maxDuration?: number;
    maxCost?: number;
    requiredAccuracy?: number;
  };
  preferences?: {
    trizPrinciples?: number[];
    optimizeFor?: 'speed' | 'accuracy' | 'cost';
  };
}) {
  try {
    const workflow = await workflowGenerator.generateWorkflow(requirements);
    
    // Save workflow to database
    await supabaseAdmin.from('workflows').insert({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      config: workflow,
      status: 'draft',
      created_at: new Date(),
    });
    
    revalidatePath('/workflows');
    
    return { success: true, data: workflow };
  } catch (error) {
    console.error('Workflow generation error:', error);
    return { success: false, error: error.message };
  }
}

export async function getWorkflowTemplates() {
  return workflowGenerator.getTemplates();
}

export async function executeWorkflow(workflowId: string) {
  try {
    // Get workflow from database
    const { data: workflow, error } = await supabaseAdmin
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();
      
    if (error || !workflow) {
      throw new Error('Workflow not found');
    }
    
    // Create execution record
    const { data: execution } = await supabaseAdmin
      .from('workflow_executions')
      .insert({
        workflow_id: workflowId,
        status: 'running',
        started_at: new Date(),
      })
      .select()
      .single();
      
    // Execute workflow steps (simplified)
    // In production, this would be handled by a queue/worker system
    
    revalidatePath('/workflows');
    revalidatePath(`/workflows/${workflowId}`);
    
    return { success: true, executionId: execution.id };
  } catch (error) {
    console.error('Workflow execution error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Knowledge Graph Actions ====================

export async function createRestaurantNode(restaurantData: any) {
  try {
    const node = await graphBuilder.createRestaurantNode(restaurantData);
    revalidateTag('graph-nodes');
    return { success: true, data: node };
  } catch (error) {
    console.error('Create restaurant node error:', error);
    return { success: false, error: error.message };
  }
}

export async function detectCommunities(
  nodeLabel: string,
  relationshipType: string,
  algorithm: 'louvain' | 'label-propagation' | 'weakly-connected' = 'louvain'
) {
  try {
    const communities = await graphBuilder.detectCommunities(
      nodeLabel,
      relationshipType,
      algorithm
    );
    
    return { success: true, data: Object.fromEntries(communities) };
  } catch (error) {
    console.error('Community detection error:', error);
    return { success: false, error: error.message };
  }
}

export async function findInfluencers(
  startNodeId: string,
  steps: number = 2,
  relationshipTypes: string[] = ['INFLUENCES', 'AFFECTS', 'CAUSES']
) {
  try {
    const influencers = await graphBuilder.findInfluencers(
      startNodeId,
      steps,
      relationshipTypes
    );
    
    return { success: true, data: influencers };
  } catch (error) {
    console.error('Find influencers error:', error);
    return { success: false, error: error.message };
  }
}

export async function predictLinks(
  nodeLabel: string,
  features: string[],
  method: 'common-neighbors' | 'adamic-adar' | 'resource-allocation' = 'common-neighbors'
) {
  try {
    const predictions = await graphBuilder.predictLinks(
      nodeLabel,
      features,
      method
    );
    
    return { success: true, data: predictions };
  } catch (error) {
    console.error('Link prediction error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== AI Analysis Actions ====================

export async function generateInsights(timeRange?: { start: Date; end: Date }) {
  try {
    // Get data from multiple sources
    const [metrics, events, alerts] = await Promise.all([
      supabaseAdmin
        .from('metrics')
        .select('*')
        .gte('created_at', timeRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .lte('created_at', timeRange?.end || new Date())
        .order('created_at', { ascending: false }),
        
      supabaseAdmin
        .from('analytics_events')
        .select('*')
        .gte('timestamp', timeRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .lte('timestamp', timeRange?.end || new Date())
        .order('timestamp', { ascending: false })
        .limit(100),
        
      supabaseAdmin
        .from('alerts')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
    ]);
    
    const insights = await aiService.generateInsights({
      metrics: metrics.data || [],
      events: events.data || [],
      alerts: alerts.data || [],
      timeRange: timeRange || {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
    });
    
    // Save insights
    await supabaseAdmin.from('insights').insert(insights);
    
    revalidatePath('/analytics');
    
    return { success: true, data: insights };
  } catch (error) {
    console.error('Generate insights error:', error);
    return { success: false, error: error.message };
  }
}

export async function analyzeAlert(alertId: string) {
  try {
    // Get alert and context
    const { data: alert } = await supabaseAdmin
      .from('alerts')
      .select('*')
      .eq('id', alertId)
      .single();
      
    if (!alert) {
      throw new Error('Alert not found');
    }
    
    const [historicalAlerts, currentMetrics, recentEvents] = await Promise.all([
      supabaseAdmin
        .from('alerts')
        .select('*')
        .eq('type', alert.type)
        .neq('id', alertId)
        .order('created_at', { ascending: false })
        .limit(20),
        
      supabaseAdmin
        .from('metrics')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .order('created_at', { ascending: false }),
        
      supabaseAdmin
        .from('analytics_events')
        .select('*')
        .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000))
        .order('timestamp', { ascending: false })
        .limit(50),
    ]);
    
    const analysis = await aiService.analyzeAlert(alert, {
      historicalAlerts: historicalAlerts.data || [],
      currentMetrics: currentMetrics.data || [],
      recentEvents: recentEvents.data || [],
    });
    
    // Update alert with analysis
    await supabaseAdmin
      .from('alerts')
      .update({
        analysis,
        analyzed_at: new Date(),
      })
      .eq('id', alertId);
      
    revalidatePath('/alerts');
    revalidatePath(`/alerts/${alertId}`);
    
    return { success: true, data: analysis };
  } catch (error) {
    console.error('Analyze alert error:', error);
    return { success: false, error: error.message };
  }
}

export async function processNaturalLanguageQuery(
  query: string,
  context?: {
    timeRange?: { start: Date; end: Date };
    userRole?: string;
  }
) {
  try {
    // Get available metrics
    const { data: metricsData } = await supabaseAdmin
      .from('metric_definitions')
      .select('name');
      
    const availableMetrics = metricsData?.map(m => m.name) || [];
    
    const result = await aiService.processNaturalLanguageQuery(query, {
      availableMetrics,
      ...context,
    });
    
    // Execute queries if generated
    let data = null;
    
    if (result.cypherQuery) {
      data = await runQuery(result.cypherQuery);
    } else if (result.sqlQuery) {
      data = await executeQuery(result.sqlQuery);
    }
    
    return { success: true, data: { ...result, queryResult: data } };
  } catch (error) {
    console.error('Natural language query error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Data Integration Actions ====================

export async function syncToastData(options?: {
  includeOrders?: boolean;
  includeMenu?: boolean;
  includeEmployees?: boolean;
  includeInventory?: boolean;
  startDate?: Date;
  endDate?: Date;
}) {
  try {
    const toastIntegration = new ToastIntegration({
      clientId: process.env.TOAST_CLIENT_ID!,
      clientSecret: process.env.TOAST_CLIENT_SECRET!,
      restaurantId: process.env.TOAST_RESTAURANT_ID!,
    });
    
    const data = await toastIntegration.syncAll(options);
    
    // Process and save data
    if (data.orders) {
      await supabaseAdmin.from('orders').upsert(data.orders);
    }
    if (data.menuItems) {
      await supabaseAdmin.from('menu_items').upsert(data.menuItems);
    }
    if (data.employees) {
      await supabaseAdmin.from('employees').upsert(data.employees);
    }
    
    revalidatePath('/integrations');
    
    return { success: true, data: { count: Object.values(data).flat().length } };
  } catch (error) {
    console.error('Toast sync error:', error);
    return { success: false, error: error.message };
  }
}

export async function syncOpenTableData(options?: {
  startDate?: Date;
  endDate?: Date;
  includeGuests?: boolean;
}) {
  try {
    const openTableIntegration = new OpenTableIntegration({
      clientId: process.env.OPENTABLE_CLIENT_ID!,
      clientSecret: process.env.OPENTABLE_CLIENT_SECRET!,
      restaurantId: process.env.OPENTABLE_RESTAURANT_ID!,
    });
    
    const data = await openTableIntegration.syncReservations(options);
    
    // Process and save data
    await supabaseAdmin.from('reservations').upsert(data.reservations);
    
    if (data.guests) {
      await supabaseAdmin.from('guests').upsert(data.guests);
    }
    
    revalidatePath('/integrations');
    
    return { success: true, data: { count: data.reservations.length } };
  } catch (error) {
    console.error('OpenTable sync error:', error);
    return { success: false, error: error.message };
  }
}

export async function sync7ShiftsData(options?: {
  startDate?: Date;
  endDate?: Date;
  locationId?: number;
}) {
  try {
    const sevenShiftsIntegration = new SevenShiftsIntegration({
      apiKey: process.env.SEVENSHIFTS_API_KEY!,
      companyId: process.env.SEVENSHIFTS_COMPANY_ID!,
    });
    
    const data = await sevenShiftsIntegration.syncAllData(options);
    
    // Process and save data
    await supabaseAdmin.from('employees').upsert(data.employees);
    await supabaseAdmin.from('shifts').upsert(data.shifts);
    await supabaseAdmin.from('departments').upsert(data.departments);
    await supabaseAdmin.from('roles').upsert(data.roles);
    
    revalidatePath('/integrations');
    
    return { 
      success: true, 
      data: { 
        employees: data.employees.length,
        shifts: data.shifts.length,
      } 
    };
  } catch (error) {
    console.error('7shifts sync error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Alert Management Actions ====================

export async function createAlert(alertData: {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  source: string;
  data?: Record<string, any>;
}) {
  try {
    const alert: Alert = {
      id: `alert_${Date.now()}`,
      restaurantId: 'default', // Get from session/context
      ...alertData,
      status: 'active',
      createdAt: new Date(),
    };
    
    const { data } = await supabaseAdmin
      .from('alerts')
      .insert(alert)
      .select()
      .single();
      
    // Analyze alert automatically
    await analyzeAlert(data.id);
    
    revalidatePath('/alerts');
    
    return { success: true, data };
  } catch (error) {
    console.error('Create alert error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateAlertStatus(
  alertId: string,
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed'
) {
  try {
    const updates: any = { status };
    
    if (status === 'acknowledged') {
      updates.acknowledged_at = new Date();
    } else if (status === 'resolved') {
      updates.resolved_at = new Date();
    }
    
    await supabaseAdmin
      .from('alerts')
      .update(updates)
      .eq('id', alertId);
      
    revalidatePath('/alerts');
    revalidatePath(`/alerts/${alertId}`);
    
    return { success: true };
  } catch (error) {
    console.error('Update alert status error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== Dashboard Actions ====================

export async function getDashboardData(timeRange?: { start: Date; end: Date }) {
  try {
    const range = timeRange || {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date(),
    };
    
    const [metrics, alerts, insights, events] = await Promise.all([
      supabaseAdmin
        .from('metrics')
        .select('*')
        .gte('created_at', range.start)
        .lte('created_at', range.end)
        .order('created_at', { ascending: false }),
        
      supabaseAdmin
        .from('alerts')
        .select('*')
        .eq('status', 'active')
        .order('severity', { ascending: false }),
        
      supabaseAdmin
        .from('insights')
        .select('*')
        .gte('created_at', range.start)
        .order('priority', { ascending: false })
        .limit(5),
        
      supabaseAdmin
        .from('analytics_events')
        .select('*')
        .gte('timestamp', range.start)
        .lte('timestamp', range.end)
        .order('timestamp', { ascending: false })
        .limit(50),
    ]);
    
    // Generate summary if needed
    const summary = await aiService.generateDashboardSummary({
      metrics: metrics.data || [],
      alerts: alerts.data || [],
      insights: insights.data || [],
      timeframe: `${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}`,
    });
    
    return {
      success: true,
      data: {
        metrics: metrics.data,
        alerts: alerts.data,
        insights: insights.data,
        events: events.data,
        summary,
      },
    };
  } catch (error) {
    console.error('Get dashboard data error:', error);
    return { success: false, error: error.message };
  }
}