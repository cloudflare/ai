import { NextRequest, NextResponse } from 'next/server';
import { RestaurantIntelligenceAgent, AGENT_CAPABILITIES } from '@/lib/ai/agents/restaurant-agent';
import { KnowledgeExtractor } from '@/lib/ai/knowledge-extractor';
import { z } from 'zod';

// Request validation schema
const AgentRequestSchema = z.object({
  message: z.string().min(1),
  restaurantId: z.string(),
  options: z.object({
    stream: z.boolean().optional(),
    saveToGraph: z.boolean().optional(),
    capabilities: z.array(z.string()).optional(),
    context: z.object({
      userRole: z.string().optional(),
      timeRange: z.object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
      }).optional(),
      preferences: z.record(z.any()).optional(),
    }).optional(),
  }).optional(),
});

// Initialize agents cache (in production, use Redis or similar)
const agentsCache = new Map<string, RestaurantIntelligenceAgent>();

function getOrCreateAgent(restaurantId: string, capabilities?: string[]): RestaurantIntelligenceAgent {
  const cacheKey = `${restaurantId}_${capabilities?.join(',') || 'all'}`;
  
  if (!agentsCache.has(cacheKey)) {
    const agent = new RestaurantIntelligenceAgent({
      apiKey: process.env.OPENAI_API_KEY!,
      restaurantId,
      capabilities: capabilities as any[] || Object.values(AGENT_CAPABILITIES),
    });
    agentsCache.set(cacheKey, agent);
  }
  
  return agentsCache.get(cacheKey)!;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const validationResult = AgentRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request', 
          details: validationResult.error.errors 
        },
        { status: 400 }
      );
    }
    
    const { message, restaurantId, options } = validationResult.data;
    
    // Get or create agent
    const agent = getOrCreateAgent(restaurantId, options?.capabilities);
    
    // Update context if provided
    if (options?.context) {
      agent.updateContext({
        userRole: options.context.userRole,
        timeRange: options.context.timeRange ? {
          start: new Date(options.context.timeRange.start!),
          end: new Date(options.context.timeRange.end!),
        } : undefined,
        preferences: options.context.preferences,
      });
    }
    
    // Handle streaming response
    if (options?.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Process message with streaming
            const response = await agent.processMessage(message, {
              stream: true,
              saveToGraph: options.saveToGraph,
            });
            
            // Stream the response
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'response',
              content: response.response,
              metadata: response.metadata,
            })}\n\n`));
            
            // Extract and save knowledge if requested
            if (options.saveToGraph && response.extractedKnowledge) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'knowledge',
                content: response.extractedKnowledge,
              })}\n\n`));
            }
            
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            })}\n\n`));
            controller.close();
          }
        },
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    // Handle regular response
    const response = await agent.processMessage(message, {
      saveToGraph: options?.saveToGraph,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        response: response.response,
        metadata: response.metadata,
        extractedKnowledge: response.extractedKnowledge,
        conversationId: response.metadata?.conversationId,
      },
    });
    
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

// Get agent conversation history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const restaurantId = searchParams.get('restaurantId');
    const conversationId = searchParams.get('conversationId');
    
    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Restaurant ID is required' },
        { status: 400 }
      );
    }
    
    // In production, retrieve from persistent storage
    const agent = agentsCache.get(restaurantId);
    
    if (!agent) {
      return NextResponse.json({
        success: true,
        data: {
          history: [],
          message: 'No conversation history found',
        },
      });
    }
    
    const history = agent.getHistory();
    
    return NextResponse.json({
      success: true,
      data: {
        history,
        conversationId,
        restaurantId,
      },
    });
    
  } catch (error) {
    console.error('Get history error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

// Extract knowledge from text
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, restaurantId, type, metadata } = body;
    
    if (!text || !restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Text and restaurant ID are required' },
        { status: 400 }
      );
    }
    
    const extractor = new KnowledgeExtractor(restaurantId);
    
    // Extract knowledge
    const extraction = await extractor.extractFromText(text, {
      type,
      metadata,
    });
    
    // Save to graph
    const saveResult = await extractor.saveToGraph(extraction);
    
    return NextResponse.json({
      success: true,
      data: {
        extraction,
        saveResult,
      },
    });
    
  } catch (error) {
    console.error('Knowledge extraction error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

// Clear agent cache (admin endpoint)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const restaurantId = searchParams.get('restaurantId');
    const clearAll = searchParams.get('clearAll') === 'true';
    
    if (clearAll) {
      agentsCache.clear();
      return NextResponse.json({
        success: true,
        message: 'All agent caches cleared',
      });
    }
    
    if (restaurantId) {
      // Clear all agents for this restaurant
      const keysToDelete = Array.from(agentsCache.keys()).filter(
        key => key.startsWith(restaurantId)
      );
      keysToDelete.forEach(key => agentsCache.delete(key));
      
      return NextResponse.json({
        success: true,
        message: `Cleared ${keysToDelete.length} agent caches for restaurant ${restaurantId}`,
      });
    }
    
    return NextResponse.json(
      { success: false, error: 'Restaurant ID or clearAll flag required' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('Clear cache error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      },
      { status: 500 }
    );
  }
}