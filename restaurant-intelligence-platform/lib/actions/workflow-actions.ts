'use server';

import { z } from 'zod';
import { CompleteWorkflowSchema, AIWorkflowGenerator } from '@/lib/workflows/ai-workflow-generator';
import { WorkflowValidator } from '@/lib/workflows/workflow-validator';
import { WorkflowTemplates } from '@/lib/workflows/workflow-templates';
import { Workflow, WorkflowExecution } from '@/lib/types';
import { createClient } from '@/lib/db/supabase';

// Action result types
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Workflow creation input schema
const CreateWorkflowInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  templateId: z.string().optional(),
  requirements: z.object({
    goal: z.string(),
    dataSources: z.array(z.string()),
    dataTypes: z.array(z.string()).optional(),
    constraints: z.object({
      maxDuration: z.number().optional(),
      maxCost: z.number().optional(),
      requiredAccuracy: z.number().optional(),
      security: z.array(z.string()).optional(),
    }).optional(),
    preferences: z.object({
      optimizeFor: z.enum(['speed', 'accuracy', 'cost', 'reliability']).optional(),
      preferredTools: z.array(z.string()).optional(),
      avoidTools: z.array(z.string()).optional(),
    }).optional(),
    context: z.object({
      restaurantPlatforms: z.array(z.string()).optional(),
      existingIntegrations: z.array(z.string()).optional(),
      teamCapabilities: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
});

// Initialize services
const workflowGenerator = new AIWorkflowGenerator();
const workflowValidator = new WorkflowValidator();
const workflowTemplates = new WorkflowTemplates();

/**
 * Create a new workflow with complete configuration
 */
export async function createWorkflow(
  input: z.infer<typeof CreateWorkflowInput>
): Promise<ActionResult<Workflow>> {
  try {
    // Validate input
    const validInput = CreateWorkflowInput.parse(input);
    
    let workflow: Workflow;
    
    if (validInput.templateId) {
      // Use template
      const template = workflowTemplates.getTemplate(validInput.templateId);
      if (!template) {
        return { success: false, error: 'Template not found' };
      }
      
      workflow = workflowTemplates.createFromTemplate(template, {
        name: validInput.name,
        description: validInput.description,
      });
    } else if (validInput.requirements) {
      // Generate with AI
      workflow = await workflowGenerator.generateWorkflow(validInput.requirements);
      workflow.name = validInput.name;
      workflow.description = validInput.description || workflow.description;
    } else {
      return { success: false, error: 'Either templateId or requirements must be provided' };
    }
    
    // Validate workflow configuration
    const validation = await validateWorkflowConfig(workflow);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    
    // Ensure all steps have proper configs
    const enhancedWorkflow = await ensureCompleteConfigs(workflow);
    
    // Save to database
    const supabase = createClient();
    const { data, error } = await supabase
      .from('workflows')
      .insert([enhancedWorkflow])
      .select()
      .single();
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Create workflow error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create workflow' 
    };
  }
}

/**
 * Validate workflow configuration
 */
export async function validateWorkflowConfig(
  workflow: any
): Promise<ActionResult<{ valid: boolean; issues?: any[] }>> {
  try {
    const result = await workflowValidator.validate(workflow);
    
    if (result.valid) {
      return { success: true, data: { valid: true } };
    } else {
      return { 
        success: true, 
        data: { valid: false, issues: result.errors } 
      };
    }
  } catch (error) {
    console.error('Validate workflow error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Validation failed' 
    };
  }
}

/**
 * Generate workflow using AI
 */
export async function generateWorkflow(
  requirements: any
): Promise<ActionResult<Workflow>> {
  try {
    const workflow = await workflowGenerator.generateWorkflow(requirements);
    
    // Validate generated workflow
    const validation = await validateWorkflowConfig(workflow);
    if (!validation.success || !validation.data?.valid) {
      return { 
        success: false, 
        error: 'Generated workflow failed validation' 
      };
    }
    
    return { success: true, data: workflow };
  } catch (error) {
    console.error('Generate workflow error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Generation failed' 
    };
  }
}

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  workflowId: string,
  context?: Record<string, any>
): Promise<ActionResult<WorkflowExecution>> {
  try {
    // Fetch workflow
    const supabase = createClient();
    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();
    
    if (error || !workflow) {
      return { success: false, error: 'Workflow not found' };
    }
    
    // Validate workflow is active
    if (workflow.status !== 'active') {
      return { success: false, error: 'Workflow is not active' };
    }
    
    // Create execution record
    const execution: WorkflowExecution = {
      id: `exec-${Date.now()}`,
      workflowId,
      status: 'pending',
      startTime: new Date(),
      steps: workflow.steps.map((step: any) => ({
        stepId: step.id,
        status: 'pending',
      })),
      context: context || {},
    };
    
    // Save execution
    const { data: savedExecution, error: saveError } = await supabase
      .from('workflow_executions')
      .insert([execution])
      .select()
      .single();
    
    if (saveError) {
      return { success: false, error: saveError.message };
    }
    
    // Start async execution
    executeWorkflowAsync(savedExecution.id, workflow, context);
    
    return { success: true, data: savedExecution };
  } catch (error) {
    console.error('Execute workflow error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Execution failed' 
    };
  }
}

/**
 * Get workflow templates
 */
export async function getWorkflowTemplates(): Promise<ActionResult<any[]>> {
  try {
    const templates = workflowTemplates.getAllTemplates();
    return { success: true, data: templates };
  } catch (error) {
    console.error('Get templates error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get templates' 
    };
  }
}

/**
 * Update workflow configuration
 */
export async function updateWorkflow(
  workflowId: string,
  updates: Partial<Workflow>
): Promise<ActionResult<Workflow>> {
  try {
    // Fetch existing workflow
    const supabase = createClient();
    const { data: existing, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();
    
    if (fetchError || !existing) {
      return { success: false, error: 'Workflow not found' };
    }
    
    // Merge updates
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    // Validate updated workflow
    const validation = await validateWorkflowConfig(updated);
    if (!validation.success || !validation.data?.valid) {
      return { 
        success: false, 
        error: 'Updated workflow failed validation' 
      };
    }
    
    // Ensure complete configs
    const enhanced = await ensureCompleteConfigs(updated);
    
    // Save updates
    const { data, error } = await supabase
      .from('workflows')
      .update(enhanced)
      .eq('id', workflowId)
      .select()
      .single();
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('Update workflow error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Update failed' 
    };
  }
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(
  workflowId: string
): Promise<ActionResult<void>> {
  try {
    const supabase = createClient();
    
    // Check for active executions
    const { data: executions } = await supabase
      .from('workflow_executions')
      .select('id')
      .eq('workflowId', workflowId)
      .in('status', ['pending', 'running'])
      .limit(1);
    
    if (executions && executions.length > 0) {
      return { success: false, error: 'Cannot delete workflow with active executions' };
    }
    
    // Delete workflow
    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', workflowId);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Delete workflow error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Delete failed' 
    };
  }
}

/**
 * Ensure all workflow steps have complete configurations
 */
async function ensureCompleteConfigs(workflow: any): Promise<Workflow> {
  const enhancedSteps = workflow.steps.map((step: any) => {
    // Check if config is empty or minimal
    if (!step.config || Object.keys(step.config).length === 0) {
      throw new Error(`Step ${step.id} has empty configuration`);
    }
    
    // Ensure required fields based on step type
    const requiredFields = getRequiredFieldsForStepType(step.type);
    const missingFields = requiredFields.filter(field => !step.config[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Step ${step.id} missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Add default error handling if missing
    if (!step.errorHandling) {
      step.errorHandling = {
        strategy: 'retry',
        retryConfig: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          maxDelay: 30000,
          initialDelay: 1000,
        },
        alertOnError: true,
      };
    }
    
    // Add default performance config if missing
    if (!step.performance) {
      step.performance = {
        timeout: 60000,
        concurrency: 1,
      };
    }
    
    return step;
  });
  
  return {
    ...workflow,
    steps: enhancedSteps,
  };
}

/**
 * Get required fields for step type
 */
function getRequiredFieldsForStepType(type: string): string[] {
  switch (type) {
    case 'transform':
      return ['source', 'transformation', 'destination'];
    case 'validate':
      return ['schema', 'rules', 'onInvalid'];
    case 'enrich':
      return ['sources', 'fields', 'strategy'];
    case 'aggregate':
      return ['groupBy', 'metrics', 'window'];
    case 'distribute':
      return ['destinations', 'routing', 'delivery'];
    case 'monitor':
      return ['targets', 'checks', 'alerting'];
    case 'query':
      return ['database', 'query'];
    case 'compute':
      return ['algorithm', 'inputs', 'outputs'];
    default:
      return [];
  }
}

/**
 * Execute workflow asynchronously
 */
async function executeWorkflowAsync(
  executionId: string,
  workflow: Workflow,
  context?: Record<string, any>
): Promise<void> {
  const supabase = createClient();
  
  try {
    // Update execution status to running
    await supabase
      .from('workflow_executions')
      .update({ status: 'running', startTime: new Date() })
      .eq('id', executionId);
    
    // Execute each step
    for (const step of workflow.steps) {
      try {
        // Update step status
        await updateStepStatus(executionId, step.id, 'running');
        
        // Execute step (placeholder - actual implementation would call step executors)
        const result = await executeStep(step, context);
        
        // Update step status with result
        await updateStepStatus(executionId, step.id, 'completed', result);
        
        // Update context for next steps
        if (result) {
          context = { ...context, [`step.${step.id}.output`]: result };
        }
      } catch (error) {
        // Handle step error
        await updateStepStatus(
          executionId, 
          step.id, 
          'failed', 
          undefined, 
          error instanceof Error ? error.message : 'Step failed'
        );
        
        // Check error handling strategy
        if (step.errorHandling?.strategy === 'fail') {
          throw error;
        }
      }
    }
    
    // Update execution status to completed
    await supabase
      .from('workflow_executions')
      .update({ 
        status: 'completed', 
        endTime: new Date(),
        result: context,
      })
      .eq('id', executionId);
  } catch (error) {
    // Update execution status to failed
    await supabase
      .from('workflow_executions')
      .update({ 
        status: 'failed', 
        endTime: new Date(),
        error: error instanceof Error ? error.message : 'Execution failed',
      })
      .eq('id', executionId);
  }
}

/**
 * Update step status in execution
 */
async function updateStepStatus(
  executionId: string,
  stepId: string,
  status: string,
  output?: any,
  error?: string
): Promise<void> {
  const supabase = createClient();
  
  // Fetch current execution
  const { data: execution } = await supabase
    .from('workflow_executions')
    .select('steps')
    .eq('id', executionId)
    .single();
  
  if (execution) {
    // Update step in steps array
    const updatedSteps = execution.steps.map((s: any) => {
      if (s.stepId === stepId) {
        return {
          ...s,
          status,
          startTime: status === 'running' ? new Date() : s.startTime,
          endTime: ['completed', 'failed', 'skipped'].includes(status) ? new Date() : undefined,
          output,
          error,
        };
      }
      return s;
    });
    
    // Save updated steps
    await supabase
      .from('workflow_executions')
      .update({ steps: updatedSteps })
      .eq('id', executionId);
  }
}

/**
 * Execute a single workflow step (placeholder)
 */
async function executeStep(step: any, context?: Record<string, any>): Promise<any> {
  // This is a placeholder - actual implementation would:
  // 1. Load the appropriate step executor based on type
  // 2. Pass configuration and context
  // 3. Execute the step logic
  // 4. Return the result
  
  console.log(`Executing step ${step.id} of type ${step.type}`);
  
  // Simulate execution delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Return mock result
  return {
    success: true,
    data: `Result from ${step.id}`,
    timestamp: new Date().toISOString(),
  };
}