import { NextRequest } from 'next/server';
import { createOpenAIStream, buildContextualPrompt, SYSTEM_PROMPTS } from '@/lib/ai/openai-stream';
import { extractKnowledge } from '@/lib/ai/knowledge-extractor';
import { initializeDriver, runQuery } from '@/lib/utils/neo4j-driver';

export async function POST(request: NextRequest) {
  try {
    const { message, conversationId, context } = await request.json();

    if (!message) {
      return new Response('Message is required', { status: 400 });
    }

    // Build contextual prompt
    const contextualMessage = buildContextualPrompt(message, context || {});

    // Get conversation history from database if available
    let history = [];
    if (process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD) {
      try {
        initializeDriver({
          uri: process.env.NEO4J_URI,
          username: process.env.NEO4J_USERNAME,
          password: process.env.NEO4J_PASSWORD,
          database: process.env.NEO4J_DATABASE
        });

        const result = await runQuery(`
          MATCH (c:Conversation {id: $conversationId})-[:HAS_MESSAGE]->(m:Message)
          RETURN m.role as role, m.content as content
          ORDER BY m.timestamp
          LIMIT 20
        `, { conversationId });

        history = result.records.map(record => ({
          role: record.get('role'),
          content: record.get('content')
        }));
      } catch (error) {
        console.error('Error fetching conversation history:', error);
      }
    }

    // Prepare messages
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPTS.restaurantAnalyst },
      ...history,
      { role: 'user' as const, content: contextualMessage }
    ];

    // Create streaming response
    const stream = await createOpenAIStream(messages, {
      temperature: 0.7,
      max_tokens: 2000,
      onComplete: async (fullText) => {
        // Store conversation in Neo4j if available
        if (process.env.NEO4J_URI) {
          try {
            // Store user message
            await runQuery(`
              MERGE (c:Conversation {id: $conversationId})
              CREATE (m:Message {
                role: 'user',
                content: $content,
                timestamp: datetime(),
                context: $context
              })
              CREATE (c)-[:HAS_MESSAGE]->(m)
            `, {
              conversationId,
              content: message,
              context: JSON.stringify(context || {})
            });

            // Store assistant response
            await runQuery(`
              MATCH (c:Conversation {id: $conversationId})
              CREATE (m:Message {
                role: 'assistant',
                content: $content,
                timestamp: datetime()
              })
              CREATE (c)-[:HAS_MESSAGE]->(m)
            `, {
              conversationId,
              content: fullText
            });

            // Extract and store knowledge
            const knowledge = await extractKnowledge(message, fullText);
            
            for (const entity of knowledge.entities) {
              await runQuery(`
                MERGE (e:Entity {name: $name, type: $type})
                WITH e
                MATCH (c:Conversation {id: $conversationId})
                MERGE (c)-[:MENTIONS]->(e)
              `, {
                name: entity.name,
                type: entity.type,
                conversationId
              });
            }

            for (const insight of knowledge.insights) {
              await runQuery(`
                MATCH (c:Conversation {id: $conversationId})
                CREATE (i:Insight {
                  type: $type,
                  content: $content,
                  confidence: $confidence,
                  timestamp: datetime()
                })
                CREATE (c)-[:GENERATED]->(i)
              `, {
                conversationId,
                type: insight.type,
                content: insight.content,
                confidence: insight.confidence
              });
            }
          } catch (error) {
            console.error('Error storing conversation:', error);
          }
        }
      }
    });

    return stream;
  } catch (error) {
    console.error('Streaming error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}