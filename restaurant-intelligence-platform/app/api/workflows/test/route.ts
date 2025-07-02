import { NextRequest, NextResponse } from 'next/server';
import { AIWorkflowGenerator } from '@/lib/workflows/ai-workflow-generator';
import { WorkflowValidator } from '@/lib/workflows/workflow-validator';
import { WorkflowTemplates } from '@/lib/workflows/workflow-templates';
import { z } from 'zod';

// Test workflow generation endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'generate':
        return handleGenerate(params);
      case 'validate':
        return handleValidate(params);
      case 'templates':
        return handleTemplates();
      case 'test-all':
        return handleTestAll();
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Workflow test error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Generate a workflow using AI
async function handleGenerate(params: any) {
  const generator = new AIWorkflowGenerator();
  
  const requirements = {
    goal: params.goal || 'Process restaurant orders from multiple POS systems',
    dataSources: params.dataSources || ['toast', 'opentable', '7shifts'],
    dataTypes: params.dataTypes || ['orders', 'reservations', 'shifts'],
    constraints: {
      maxDuration: params.maxDuration || 300000, // 5 minutes
      requiredAccuracy: params.requiredAccuracy || 0.99,
    },
    preferences: {
      optimizeFor: params.optimizeFor || 'accuracy',
    },
    context: {
      restaurantPlatforms: ['toast', 'opentable', '7shifts'],
      existingIntegrations: ['neo4j', 'snowflake'],
    },
  };

  try {
    const workflow = await generator.generateWorkflow(requirements);
    
    // Validate the generated workflow
    const validator = new WorkflowValidator();
    const validation = await validator.validate(workflow);
    
    return NextResponse.json({
      success: true,
      workflow,
      validation,
      stats: {
        stepCount: workflow.steps.length,
        hasCompleteConfigs: workflow.steps.every(s => Object.keys(s.config).length > 0),
        complexity: workflow.metadata?.complexity,
        estimatedDuration: workflow.metadata?.estimatedDuration,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Generation failed',
        details: error instanceof z.ZodError ? error.errors : undefined,
      },
      { status: 400 }
    );
  }
}

// Validate a workflow configuration
async function handleValidate(params: any) {
  const validator = new WorkflowValidator();
  
  try {
    const result = await validator.validate(params.workflow);
    
    return NextResponse.json({
      success: true,
      validation: result,
      details: {
        stepValidation: params.workflow?.steps?.map((step: any) => ({
          id: step.id,
          type: step.type,
          hasConfig: !!step.config && Object.keys(step.config).length > 0,
          configKeys: Object.keys(step.config || {}),
          hasErrorHandling: !!step.errorHandling,
          hasPerformance: !!step.performance,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Validation failed',
        details: error instanceof z.ZodError ? error.errors : undefined,
      },
      { status: 400 }
    );
  }
}

// Get available workflow templates
async function handleTemplates() {
  const templates = new WorkflowTemplates();
  
  const allTemplates = templates.getAllTemplates();
  
  return NextResponse.json({
    success: true,
    templates: allTemplates,
    count: allTemplates.length,
    categories: [...new Set(allTemplates.map(t => t.category))],
  });
}

// Run comprehensive tests
async function handleTestAll() {
  const generator = new AIWorkflowGenerator();
  const validator = new WorkflowValidator();
  const templates = new WorkflowTemplates();
  
  const results = {
    generation: { success: false, error: null as any },
    validation: { success: false, error: null as any },
    templates: { success: false, error: null as any },
    configCompleteness: { success: false, error: null as any },
  };
  
  // Test 1: Generate a workflow
  try {
    const workflow = await generator.generateWorkflow({
      goal: 'Real-time restaurant analytics pipeline',
      dataSources: ['toast', 'opentable'],
      preferences: { optimizeFor: 'speed' },
    });
    
    results.generation = {
      success: true,
      error: null,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        stepCount: workflow.steps.length,
      },
    };
    
    // Test 2: Validate the generated workflow
    try {
      const validation = await validator.validate(workflow);
      results.validation = {
        success: validation.valid,
        error: validation.errors?.[0] || null,
      };
    } catch (error) {
      results.validation.error = error instanceof Error ? error.message : 'Validation failed';
    }
    
    // Test 3: Check config completeness
    const incompleteSteps = workflow.steps.filter(
      step => !step.config || Object.keys(step.config).length === 0
    );
    
    results.configCompleteness = {
      success: incompleteSteps.length === 0,
      error: incompleteSteps.length > 0 
        ? `${incompleteSteps.length} steps have empty configs: ${incompleteSteps.map(s => s.id).join(', ')}`
        : null,
    };
  } catch (error) {
    results.generation.error = error instanceof Error ? error.message : 'Generation failed';
  }
  
  // Test 4: Validate all templates
  try {
    const allTemplates = templates.getAllTemplates();
    const templateValidations = await Promise.all(
      allTemplates.map(async (template) => {
        const workflow = templates.createFromTemplate(template);
        const validation = await validator.validate(workflow);
        return {
          templateId: template.id,
          valid: validation.valid,
          errors: validation.errors,
        };
      })
    );
    
    const invalidTemplates = templateValidations.filter(t => !t.valid);
    
    results.templates = {
      success: invalidTemplates.length === 0,
      error: invalidTemplates.length > 0
        ? `${invalidTemplates.length} templates failed validation`
        : null,
      details: templateValidations,
    };
  } catch (error) {
    results.templates.error = error instanceof Error ? error.message : 'Template validation failed';
  }
  
  // Calculate overall success
  const overallSuccess = Object.values(results).every(r => r.success);
  
  return NextResponse.json({
    success: overallSuccess,
    results,
    summary: {
      testsRun: Object.keys(results).length,
      testsPassed: Object.values(results).filter(r => r.success).length,
      testsFailed: Object.values(results).filter(r => !r.success).length,
    },
  });
}

// GET endpoint to show available actions
export async function GET() {
  return NextResponse.json({
    endpoints: {
      generate: {
        method: 'POST',
        body: {
          action: 'generate',
          goal: 'string (optional)',
          dataSources: 'string[] (optional)',
          dataTypes: 'string[] (optional)',
          maxDuration: 'number (optional)',
          requiredAccuracy: 'number (optional)',
          optimizeFor: 'speed | accuracy | cost | reliability (optional)',
        },
      },
      validate: {
        method: 'POST',
        body: {
          action: 'validate',
          workflow: 'Workflow object',
        },
      },
      templates: {
        method: 'POST',
        body: {
          action: 'templates',
        },
      },
      testAll: {
        method: 'POST',
        body: {
          action: 'test-all',
        },
      },
    },
    examples: {
      generate: {
        action: 'generate',
        goal: 'Process and analyze restaurant orders in real-time',
        dataSources: ['toast', 'doordash'],
        optimizeFor: 'speed',
      },
      validate: {
        action: 'validate',
        workflow: {
          id: 'test-workflow',
          name: 'Test Workflow',
          trigger: { type: 'manual', config: {} },
          steps: [
            {
              id: 'step1',
              type: 'transform',
              name: 'Transform Data',
              config: { source: 'test', destination: 'test' },
            },
          ],
          status: 'draft',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    },
  });
}