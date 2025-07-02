import { NextRequest, NextResponse } from 'next/server';
import { CDPEngine, CDPConfig } from '@/lib/automation/cdp-engine';
import { z } from 'zod';

// CDP API Routes for Customer Data Platform automation

// Initialize CDP Engine (in production, this would be a singleton or service)
let cdpEngine: CDPEngine | null = null;

const CustomerSchema = z.object({
  id: z.string().optional(),
  externalIds: z.record(z.string()).optional(),
  profile: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    dateOfBirth: z.string().optional(),
    loyaltyStatus: z.enum(['new', 'regular', 'vip', 'at_risk', 'churned']).optional(),
    marketingConsent: z.object({
      email: z.boolean(),
      sms: z.boolean(),
      push: z.boolean(),
    }).optional(),
  }).optional(),
  preferences: z.object({
    dietary: z.array(z.string()).optional(),
    cuisine: z.array(z.string()).optional(),
    diningTime: z.array(z.string()).optional(),
    communication: z.object({
      frequency: z.enum(['never', 'weekly', 'monthly', 'special_only']),
      channels: z.array(z.string()),
    }).optional(),
  }).optional(),
});

const SegmentationConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rules: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'in', 'between']),
    value: z.any(),
    weight: z.number().optional(),
  })),
  updateFrequency: z.enum(['real_time', 'hourly', 'daily', 'weekly']),
  actions: z.array(z.object({
    type: z.enum(['email', 'sms', 'push', 'personalization', 'offer']),
    trigger: z.enum(['on_entry', 'on_exit', 'periodic']),
    config: z.record(z.any()),
  })),
});

const DataIngestionSchema = z.object({
  source: z.string(),
  data: z.array(z.record(z.any())),
});

// Initialize CDP with default configuration
function initializeCDP(): CDPEngine {
  if (!cdpEngine) {
    const defaultConfig: CDPConfig = {
      dataSources: [
        {
          id: 'pos_system',
          name: 'POS System',
          type: 'api',
          connection: {
            type: 'rest',
            endpoint: '/api/pos',
          },
          mappings: [
            { source: 'customer_id', target: 'id', required: true },
            { source: 'email', target: 'profile.email', required: false },
            { source: 'phone', target: 'profile.phone', required: false },
            { source: 'first_name', target: 'profile.firstName', required: false },
            { source: 'last_name', target: 'profile.lastName', required: false },
          ],
          syncSchedule: '*/15 * * * *', // Every 15 minutes
          enabled: true,
        },
      ],
      segmentationRules: [
        {
          id: 'high_value_customers',
          name: 'High Value Customers',
          description: 'Customers with high lifetime value',
          rules: [
            {
              field: 'metrics.lifetimeValue',
              operator: 'greater_than',
              value: 1000,
              weight: 1,
            },
          ],
          updateFrequency: 'daily',
          actions: [
            {
              type: 'email',
              trigger: 'on_entry',
              config: {
                template: 'vip_welcome',
                personalizer: true,
              },
            },
          ],
        },
        {
          id: 'at_risk_customers',
          name: 'At Risk Customers',
          description: 'Customers who haven\'t visited recently',
          rules: [
            {
              field: 'metrics.recency',
              operator: 'greater_than',
              value: 30, // 30 days
              weight: 0.7,
            },
            {
              field: 'metrics.frequency',
              operator: 'greater_than',
              value: 3, // Previously frequent
              weight: 0.3,
            },
          ],
          updateFrequency: 'daily',
          actions: [
            {
              type: 'email',
              trigger: 'on_entry',
              config: {
                template: 'win_back_offer',
                discount: 15,
              },
            },
          ],
        },
      ],
      journeyMaps: [
        {
          id: 'customer_lifecycle',
          name: 'Customer Lifecycle Journey',
          stages: [
            {
              id: 'new_customer',
              name: 'New Customer',
              description: 'First-time visitor',
              entryRules: [
                {
                  field: 'metrics.visitCount',
                  operator: 'equals',
                  value: 1,
                },
              ],
              exitRules: [
                {
                  field: 'metrics.visitCount',
                  operator: 'greater_than',
                  value: 1,
                },
              ],
              actions: [
                {
                  id: 'welcome_email',
                  delay: 2, // 2 hours
                  type: 'message',
                  config: {
                    type: 'email',
                    template: 'welcome_series_1',
                  },
                },
              ],
            },
            {
              id: 'regular_customer',
              name: 'Regular Customer',
              description: 'Frequent visitor',
              entryRules: [
                {
                  field: 'metrics.visitFrequency',
                  operator: 'greater_than',
                  value: 2, // 2+ visits per month
                },
              ],
              exitRules: [
                {
                  field: 'metrics.recency',
                  operator: 'greater_than',
                  value: 45, // 45 days without visit
                },
              ],
              actions: [
                {
                  id: 'loyalty_offer',
                  delay: 168, // 1 week
                  type: 'offer',
                  config: {
                    type: 'loyalty_points',
                    amount: 100,
                  },
                },
              ],
            },
          ],
          transitions: [
            {
              from: 'new_customer',
              to: 'regular_customer',
              conditions: [
                {
                  field: 'metrics.visitCount',
                  operator: 'greater_than',
                  value: 3,
                },
              ],
            },
          ],
          automations: [
            {
              trigger: 'stage_entry',
              conditions: [
                {
                  field: 'stage',
                  operator: 'equals',
                  value: 'new_customer',
                },
              ],
              actions: [
                {
                  id: 'send_welcome',
                  delay: 0,
                  type: 'message',
                  config: {
                    template: 'welcome',
                  },
                },
              ],
            },
          ],
        },
      ],
      automations: [
        {
          id: 'welcome_series',
          name: 'New Customer Welcome Series',
          type: 'behavioral',
          rules: [
            {
              event: 'customer.created',
              conditions: [
                {
                  field: 'profile.marketingConsent.email',
                  operator: 'equals',
                  value: true,
                },
              ],
            },
          ],
          actions: [
            {
              type: 'send_message',
              config: {
                template: 'welcome_email',
                delay: 3600, // 1 hour
              },
            },
          ],
          enabled: true,
        },
      ],
      integrations: [
        {
          id: 'email_service',
          type: 'sendgrid',
          config: {
            apiKey: process.env.SENDGRID_API_KEY,
            fromEmail: 'noreply@restaurant.com',
            fromName: 'Restaurant Intelligence',
          },
          bidirectional: false,
          syncFields: ['email', 'firstName', 'lastName'],
          enabled: true,
        },
      ],
      privacy: {
        dataRetention: 2555, // 7 years
        anonymization: {
          enabled: true,
          fields: ['email', 'phone'],
          delay: 30, // 30 days after deletion request
        },
        consent: {
          required: true,
          granular: true,
          renewal: 365, // Annual consent renewal
        },
        deletion: {
          automated: true,
          criteria: [
            {
              field: 'profile.marketingConsent.email',
              operator: 'equals',
              value: false,
            },
          ],
        },
      },
    };

    cdpEngine = new CDPEngine(defaultConfig);
  }
  return cdpEngine;
}

// GET /api/automation/cdp - Get CDP analytics and status
export async function GET(request: NextRequest) {
  try {
    const cdp = initializeCDP();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'analytics':
        const analytics = await cdp.getCustomerAnalytics();
        return NextResponse.json({ success: true, data: analytics });
      
      case 'customers':
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');
        
        // In a real implementation, this would query the customer database
        const mockCustomers = Array.from({ length: limit }, (_, i) => ({
          id: `customer_${offset + i + 1}`,
          profile: {
            firstName: `Customer ${offset + i + 1}`,
            email: `customer${offset + i + 1}@example.com`,
            loyaltyStatus: ['new', 'regular', 'vip'][Math.floor(Math.random() * 3)],
          },
          segments: [],
          metrics: {
            lifetimeValue: Math.random() * 2000,
            visitFrequency: Math.random() * 10,
            churnRisk: Math.random(),
          },
        }));
        
        return NextResponse.json({ success: true, data: mockCustomers });
      
      case 'segments':
        // Return configured segments with customer counts
        const segments = [
          { id: 'high_value', name: 'High Value Customers', count: 156, description: 'Customers with LTV > $1000' },
          { id: 'at_risk', name: 'At Risk Customers', count: 89, description: 'Haven\'t visited in 30+ days' },
          { id: 'new_customers', name: 'New Customers', count: 234, description: 'First-time visitors' },
          { id: 'regulars', name: 'Regular Customers', count: 445, description: 'Frequent visitors' },
        ];
        
        return NextResponse.json({ success: true, data: segments });
      
      default:
        return NextResponse.json({ 
          success: true, 
          data: { 
            status: 'active',
            version: '1.0.0',
            features: ['segmentation', 'journey_mapping', 'automation']
          } 
        });
    }
  } catch (error) {
    console.error('CDP GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch CDP data' },
      { status: 500 }
    );
  }
}

// POST /api/automation/cdp - Create or update customers, segments, etc.
export async function POST(request: NextRequest) {
  try {
    const cdp = initializeCDP();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    switch (action) {
      case 'customer':
        // Create or update customer
        const customerData = CustomerSchema.parse(body);
        
        let customer;
        if (customerData.id) {
          customer = await cdp.updateCustomer(customerData.id, customerData as any);
        } else {
          customer = await cdp.createCustomer(customerData as any);
        }
        
        return NextResponse.json({ success: true, data: customer });
      
      case 'segment':
        // Create segment configuration
        const segmentData = SegmentationConfigSchema.parse(body);
        
        // In a real implementation, this would update the CDP configuration
        console.log('Creating segment:', segmentData);
        
        return NextResponse.json({ 
          success: true, 
          data: { 
            id: segmentData.id,
            message: 'Segment created successfully'
          } 
        });
      
      case 'ingest':
        // Ingest data from external sources
        const ingestionData = DataIngestionSchema.parse(body);
        
        await cdp.ingestData(ingestionData.source, ingestionData.data);
        
        return NextResponse.json({
          success: true,
          data: {
            recordsProcessed: ingestionData.data.length,
            source: ingestionData.source,
          },
        });
      
      case 'trigger_automation':
        // Manually trigger automation for a customer
        const { customerId, automationId } = body;
        
        if (!customerId || !automationId) {
          return NextResponse.json(
            { success: false, error: 'customerId and automationId are required' },
            { status: 400 }
          );
        }
        
        // In a real implementation, this would trigger the automation
        console.log(`Triggering automation ${automationId} for customer ${customerId}`);
        
        return NextResponse.json({
          success: true,
          data: {
            automationId,
            customerId,
            status: 'triggered',
            timestamp: new Date().toISOString(),
          },
        });
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('CDP POST error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to process CDP request' },
      { status: 500 }
    );
  }
}

// PUT /api/automation/cdp - Update CDP configuration
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    switch (action) {
      case 'config':
        // Update CDP configuration
        const { dataSources, segmentationRules, automations } = body;
        
        // In a real implementation, this would update the CDP engine configuration
        console.log('Updating CDP configuration:', {
          dataSources: dataSources?.length || 0,
          segmentationRules: segmentationRules?.length || 0,
          automations: automations?.length || 0,
        });
        
        return NextResponse.json({
          success: true,
          data: { message: 'CDP configuration updated successfully' },
        });
      
      case 'segment':
        // Update existing segment
        const segmentUpdate = SegmentationConfigSchema.parse(body);
        
        console.log('Updating segment:', segmentUpdate.id);
        
        return NextResponse.json({
          success: true,
          data: { id: segmentUpdate.id, message: 'Segment updated successfully' },
        });
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('CDP PUT error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to update CDP configuration' },
      { status: 500 }
    );
  }
}

// DELETE /api/automation/cdp - Delete customers, segments, etc.
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID is required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'customer':
        // Delete customer (GDPR compliance)
        console.log('Deleting customer:', id);
        
        // In a real implementation, this would:
        // 1. Anonymize customer data
        // 2. Remove from segments
        // 3. Stop automations
        // 4. Log deletion for audit
        
        return NextResponse.json({
          success: true,
          data: { id, message: 'Customer deleted successfully' },
        });
      
      case 'segment':
        // Delete segment configuration
        console.log('Deleting segment:', id);
        
        return NextResponse.json({
          success: true,
          data: { id, message: 'Segment deleted successfully' },
        });
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('CDP DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete CDP resource' },
      { status: 500 }
    );
  }
}

// Example usage:
// GET /api/automation/cdp?action=analytics
// GET /api/automation/cdp?action=customers&limit=100&offset=0
// GET /api/automation/cdp?action=segments
// POST /api/automation/cdp?action=customer { profile: { firstName: "John", email: "john@example.com" } }
// POST /api/automation/cdp?action=ingest { source: "pos_system", data: [...] }
// PUT /api/automation/cdp?action=config { segmentationRules: [...] }
// DELETE /api/automation/cdp?action=customer&id=customer_123