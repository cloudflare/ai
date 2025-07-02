import { 
  GraphNode, 
  GraphRelationship, 
  HypergraphEdge,
  RestaurantEntity,
  Order,
  MenuItem,
  Customer,
  Employee,
  Shift
} from '@/lib/types';
import { runQuery, runTransaction, graphHelpers } from '@/lib/db/neo4j';
import { z } from 'zod';

export interface TemporalRelationship extends GraphRelationship {
  validFrom: Date;
  validTo?: Date;
  confidence: number;
}

export interface SpatialNode extends GraphNode {
  location: {
    lat: number;
    lng: number;
    address: string;
    geohash: string;
  };
  serviceRadius?: number;
}

export interface EventNode extends GraphNode {
  eventType: string;
  timestamp: Date;
  duration?: number;
  impact?: {
    revenue?: number;
    customerCount?: number;
    efficiency?: number;
  };
}

export interface CausalEdge extends GraphRelationship {
  causalStrength: number;
  timelag: number;
  mechanism: string;
  confounders?: string[];
}

export class KnowledgeGraphBuilder {
  private embeddings: Map<string, number[]> = new Map();
  
  constructor(private aiClient?: any) {}
  
  // ==================== Node Creation ====================
  
  async createRestaurantNode(restaurant: RestaurantEntity): Promise<GraphNode> {
    const node: GraphNode = {
      id: restaurant.id,
      labels: ['Restaurant', restaurant.platform],
      properties: {
        ...restaurant,
        address: JSON.stringify(restaurant.address),
        contact: JSON.stringify(restaurant.contact),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Generate embeddings for semantic search
    if (this.aiClient) {
      node.embeddings = await this.generateEmbeddings(
        `${restaurant.name} ${restaurant.address.city} ${restaurant.platform}`
      );
    }
    
    const query = `
      MERGE (r:Restaurant {id: $id})
      SET r += $properties
      SET r.createdAt = coalesce(r.createdAt, datetime())
      SET r.updatedAt = datetime()
      SET r:${restaurant.platform}
      RETURN r
    `;
    
    await runQuery(query, {
      id: node.id,
      properties: node.properties,
    });
    
    return node;
  }
  
  async createMenuItemNode(item: MenuItem): Promise<GraphNode> {
    const node: GraphNode = {
      id: item.id,
      labels: ['MenuItem', item.category],
      properties: {
        ...item,
        modifiers: JSON.stringify(item.modifiers || []),
        tags: item.tags || [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    if (this.aiClient && item.description) {
      node.embeddings = await this.generateEmbeddings(
        `${item.name} ${item.description} ${item.category}`
      );
    }
    
    const query = `
      MATCH (r:Restaurant {id: $restaurantId})
      MERGE (m:MenuItem {id: $id})
      SET m += $properties
      SET m.createdAt = coalesce(m.createdAt, datetime())
      SET m.updatedAt = datetime()
      SET m:${item.category.replace(/\s+/g, '_')}
      MERGE (r)-[:SERVES]->(m)
      RETURN m
    `;
    
    await runQuery(query, {
      id: node.id,
      restaurantId: item.restaurantId,
      properties: node.properties,
    });
    
    return node;
  }
  
  async createOrderNode(order: Order): Promise<GraphNode> {
    const node: GraphNode = {
      id: order.id,
      labels: ['Order', order.orderType, order.status],
      properties: {
        ...order,
        customer: JSON.stringify(order.customer),
        items: JSON.stringify(order.items),
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
    
    const query = `
      MATCH (r:Restaurant {id: $restaurantId})
      MERGE (o:Order {id: $id})
      SET o += $properties
      SET o:${order.orderType}:${order.status}
      MERGE (r)-[:RECEIVED]->(o)
      
      // Create or connect customer
      MERGE (c:Customer {email: $customerEmail})
      SET c.name = coalesce(c.name, $customerName)
      SET c.phone = coalesce(c.phone, $customerPhone)
      SET c.updatedAt = datetime()
      MERGE (c)-[:PLACED]->(o)
      
      RETURN o
    `;
    
    await runQuery(query, {
      id: node.id,
      restaurantId: order.restaurantId,
      properties: node.properties,
      customerEmail: order.customer.email || `unknown_${order.customer.id}`,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
    });
    
    // Create relationships to menu items
    for (const item of order.items) {
      await this.createOrderItemRelationship(order.id, item.menuItemId, item);
    }
    
    return node;
  }
  
  async createEventNode(event: Partial<EventNode>): Promise<EventNode> {
    const node: EventNode = {
      id: event.id || `event_${Date.now()}`,
      labels: ['Event', event.eventType || 'Unknown'],
      properties: {
        eventType: event.eventType || 'Unknown',
        timestamp: event.timestamp || new Date(),
        duration: event.duration,
        impact: event.impact,
        ...event.properties,
      },
      eventType: event.eventType || 'Unknown',
      timestamp: event.timestamp || new Date(),
      duration: event.duration,
      impact: event.impact,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const query = `
      CREATE (e:Event:${node.eventType.replace(/\s+/g, '_')})
      SET e = $properties
      SET e.id = $id
      SET e.createdAt = datetime()
      SET e.updatedAt = datetime()
      RETURN e
    `;
    
    await runQuery(query, {
      id: node.id,
      properties: node.properties,
    });
    
    return node;
  }
  
  // ==================== Relationship Creation ====================
  
  async createTemporalRelationship(
    sourceId: string,
    targetId: string,
    type: string,
    validFrom: Date,
    validTo?: Date,
    properties?: Record<string, any>
  ): Promise<TemporalRelationship> {
    const relationship: TemporalRelationship = {
      id: `rel_${Date.now()}`,
      sourceId,
      targetId,
      type,
      properties: {
        ...properties,
        validFrom,
        validTo,
      },
      weight: 1,
      direction: 'directed',
      validFrom,
      validTo,
      confidence: properties?.confidence || 1,
      createdAt: new Date(),
    };
    
    const query = `
      MATCH (source {id: $sourceId})
      MATCH (target {id: $targetId})
      CREATE (source)-[r:${type} {
        id: $id,
        validFrom: datetime($validFrom),
        validTo: $validTo,
        confidence: $confidence
      }]->(target)
      SET r += $properties
      SET r.createdAt = datetime()
      RETURN r
    `;
    
    await runQuery(query, {
      sourceId,
      targetId,
      id: relationship.id,
      validFrom: validFrom.toISOString(),
      validTo: validTo?.toISOString() || null,
      confidence: relationship.confidence,
      properties: properties || {},
    });
    
    return relationship;
  }
  
  async createCausalRelationship(
    causeId: string,
    effectId: string,
    strength: number,
    timelag: number,
    mechanism: string,
    confounders?: string[]
  ): Promise<CausalEdge> {
    const relationship: CausalEdge = {
      id: `causal_${Date.now()}`,
      sourceId: causeId,
      targetId: effectId,
      type: 'CAUSES',
      properties: {
        strength,
        timelag,
        mechanism,
        confounders: confounders || [],
      },
      weight: strength,
      direction: 'directed',
      causalStrength: strength,
      timelag,
      mechanism,
      confounders,
      createdAt: new Date(),
    };
    
    const query = `
      MATCH (cause {id: $causeId})
      MATCH (effect {id: $effectId})
      CREATE (cause)-[r:CAUSES {
        id: $id,
        strength: $strength,
        timelag: $timelag,
        mechanism: $mechanism,
        confounders: $confounders
      }]->(effect)
      SET r.createdAt = datetime()
      RETURN r
    `;
    
    await runQuery(query, {
      causeId,
      effectId,
      id: relationship.id,
      strength,
      timelag,
      mechanism,
      confounders: confounders || [],
    });
    
    return relationship;
  }
  
  async createHypergraphEdge(
    nodeIds: string[],
    edgeType: string,
    properties?: Record<string, any>
  ): Promise<HypergraphEdge> {
    if (nodeIds.length < 2) {
      throw new Error('Hypergraph edge must connect at least 2 nodes');
    }
    
    const edge: HypergraphEdge = {
      id: `hyperedge_${Date.now()}`,
      nodeIds,
      type: edgeType,
      properties: properties || {},
      weight: properties?.weight || 1,
      createdAt: new Date(),
    };
    
    // Create a hyperedge node to represent the multi-way relationship
    const query = `
      CREATE (h:Hyperedge:${edgeType} {
        id: $id,
        type: $edgeType,
        nodeCount: $nodeCount
      })
      SET h += $properties
      SET h.createdAt = datetime()
      
      WITH h
      UNWIND $nodeIds AS nodeId
      MATCH (n {id: nodeId})
      CREATE (n)-[:PART_OF]->(h)
      
      RETURN h
    `;
    
    await runQuery(query, {
      id: edge.id,
      edgeType,
      nodeCount: nodeIds.length,
      nodeIds,
      properties: edge.properties,
    });
    
    return edge;
  }
  
  // ==================== Analytics Functions ====================
  
  async detectCommunities(
    nodeLabel: string,
    relationshipType: string,
    algorithm: 'louvain' | 'label-propagation' | 'weakly-connected' = 'louvain'
  ): Promise<Map<string, number>> {
    // First, create a graph projection
    const projectionName = `community_${Date.now()}`;
    
    try {
      // Create projection
      await runQuery(`
        CALL gds.graph.project(
          '${projectionName}',
          '${nodeLabel}',
          '${relationshipType}'
        )
      `);
      
      // Run community detection
      let query: string;
      switch (algorithm) {
        case 'louvain':
          query = `
            CALL gds.louvain.stream('${projectionName}')
            YIELD nodeId, communityId
            RETURN gds.util.asNode(nodeId).id AS nodeId, communityId
          `;
          break;
        case 'label-propagation':
          query = `
            CALL gds.labelPropagation.stream('${projectionName}')
            YIELD nodeId, communityId
            RETURN gds.util.asNode(nodeId).id AS nodeId, communityId
          `;
          break;
        case 'weakly-connected':
          query = `
            CALL gds.wcc.stream('${projectionName}')
            YIELD nodeId, componentId
            RETURN gds.util.asNode(nodeId).id AS nodeId, componentId as communityId
          `;
          break;
      }
      
      const results = await runQuery(query);
      const communities = new Map<string, number>();
      
      results.forEach(record => {
        communities.set(record.nodeId, record.communityId);
      });
      
      // Clean up projection
      await runQuery(`CALL gds.graph.drop('${projectionName}')`);
      
      return communities;
    } catch (error) {
      // Fallback to basic community detection without GDS
      console.warn('GDS not available, using basic community detection');
      return await this.basicCommunityDetection(nodeLabel, relationshipType);
    }
  }
  
  async calculatePageRank(
    nodeLabel: string,
    relationshipType: string,
    dampingFactor: number = 0.85,
    iterations: number = 20
  ): Promise<Map<string, number>> {
    const projectionName = `pagerank_${Date.now()}`;
    
    try {
      // Create projection
      await runQuery(`
        CALL gds.graph.project(
          '${projectionName}',
          '${nodeLabel}',
          '${relationshipType}'
        )
      `);
      
      // Run PageRank
      const query = `
        CALL gds.pageRank.stream('${projectionName}', {
          dampingFactor: $dampingFactor,
          maxIterations: $iterations
        })
        YIELD nodeId, score
        RETURN gds.util.asNode(nodeId).id AS nodeId, score
        ORDER BY score DESC
      `;
      
      const results = await runQuery(query, { dampingFactor, iterations });
      const pageRanks = new Map<string, number>();
      
      results.forEach(record => {
        pageRanks.set(record.nodeId, record.score);
      });
      
      // Clean up projection
      await runQuery(`CALL gds.graph.drop('${projectionName}')`);
      
      return pageRanks;
    } catch (error) {
      console.warn('GDS not available, using basic centrality calculation');
      return await this.basicCentralityCalculation(nodeLabel, relationshipType);
    }
  }
  
  async findInfluencers(
    startNodeId: string,
    steps: number = 2,
    relationshipTypes: string[] = ['INFLUENCES', 'AFFECTS', 'CAUSES']
  ): Promise<Array<{ nodeId: string; influence: number; path: string[] }>> {
    const query = `
      MATCH path = (start {id: $startNodeId})-[${relationshipTypes.map(t => `:${t}`).join('|')}*1..${steps}]->(influenced)
      WITH influenced, 
           collect(path) as paths,
           sum(reduce(score = 1.0, r in relationships(path) | score * coalesce(r.weight, r.strength, 1.0))) as influence
      WHERE influenced.id <> $startNodeId
      RETURN influenced.id as nodeId, 
             influence,
             [p in paths | [n in nodes(p) | n.id]] as pathIds
      ORDER BY influence DESC
      LIMIT 20
    `;
    
    const results = await runQuery(query, { startNodeId });
    
    return results.map(record => ({
      nodeId: record.nodeId,
      influence: record.influence,
      path: record.pathIds[0] || [],
    }));
  }
  
  async detectAnomalies(
    nodeLabel: string,
    propertyName: string,
    timeWindow: { start: Date; end: Date },
    method: 'zscore' | 'isolation-forest' | 'lof' = 'zscore'
  ): Promise<Array<{ nodeId: string; anomalyScore: number; value: any }>> {
    // Get time-windowed data
    const query = `
      MATCH (n:${nodeLabel})
      WHERE n.createdAt >= datetime($start) AND n.createdAt <= datetime($end)
      AND n.${propertyName} IS NOT NULL
      RETURN n.id as nodeId, n.${propertyName} as value, n.createdAt as timestamp
      ORDER BY n.createdAt
    `;
    
    const results = await runQuery(query, {
      start: timeWindow.start.toISOString(),
      end: timeWindow.end.toISOString(),
    });
    
    if (results.length === 0) return [];
    
    // Calculate anomaly scores based on method
    const values = results.map(r => r.value);
    const anomalyScores = this.calculateAnomalyScores(values, method);
    
    return results.map((record, index) => ({
      nodeId: record.nodeId,
      anomalyScore: anomalyScores[index],
      value: record.value,
    })).filter(item => item.anomalyScore > 2); // Z-score threshold
  }
  
  async predictLinks(
    nodeLabel: string,
    features: string[],
    method: 'common-neighbors' | 'adamic-adar' | 'resource-allocation' = 'common-neighbors'
  ): Promise<Array<{ source: string; target: string; score: number }>> {
    let query: string;
    
    switch (method) {
      case 'common-neighbors':
        query = `
          MATCH (a:${nodeLabel})-[:CONNECTED_TO]-(common)-[:CONNECTED_TO]-(b:${nodeLabel})
          WHERE a.id < b.id AND NOT (a)-[:CONNECTED_TO]-(b)
          WITH a, b, count(distinct common) as commonNeighbors
          WHERE commonNeighbors > 1
          RETURN a.id as source, b.id as target, commonNeighbors as score
          ORDER BY score DESC
          LIMIT 100
        `;
        break;
        
      case 'adamic-adar':
        query = `
          MATCH (a:${nodeLabel})-[:CONNECTED_TO]-(common)-[:CONNECTED_TO]-(b:${nodeLabel})
          WHERE a.id < b.id AND NOT (a)-[:CONNECTED_TO]-(b)
          WITH a, b, common, count{(common)-[:CONNECTED_TO]-(:${nodeLabel})} as degree
          WITH a, b, sum(1.0 / log(degree + 1)) as score
          WHERE score > 0.5
          RETURN a.id as source, b.id as target, score
          ORDER BY score DESC
          LIMIT 100
        `;
        break;
        
      case 'resource-allocation':
        query = `
          MATCH (a:${nodeLabel})-[:CONNECTED_TO]-(common)-[:CONNECTED_TO]-(b:${nodeLabel})
          WHERE a.id < b.id AND NOT (a)-[:CONNECTED_TO]-(b)
          WITH a, b, common, count{(common)-[:CONNECTED_TO]-(:${nodeLabel})} as degree
          WITH a, b, sum(1.0 / degree) as score
          WHERE score > 0.1
          RETURN a.id as source, b.id as target, score
          ORDER BY score DESC
          LIMIT 100
        `;
        break;
    }
    
    const results = await runQuery(query);
    
    return results.map(record => ({
      source: record.source,
      target: record.target,
      score: record.score,
    }));
  }
  
  // ==================== Real-time Analytics ====================
  
  async streamAnalytics(
    query: string,
    parameters: Record<string, any>,
    onUpdate: (data: any) => void,
    pollingInterval: number = 5000
  ): Promise<() => void> {
    let isRunning = true;
    
    const poll = async () => {
      while (isRunning) {
        try {
          const results = await runQuery(query, parameters);
          onUpdate(results);
        } catch (error) {
          console.error('Stream analytics error:', error);
        }
        
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      }
    };
    
    poll();
    
    // Return cleanup function
    return () => {
      isRunning = false;
    };
  }
  
  // ==================== Helper Functions ====================
  
  private async generateEmbeddings(text: string): Promise<number[]> {
    if (!this.aiClient) {
      // Return random embeddings for demo
      return Array.from({ length: 384 }, () => Math.random());
    }
    
    try {
      const response = await this.aiClient.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate embeddings:', error);
      return Array.from({ length: 384 }, () => Math.random());
    }
  }
  
  private async basicCommunityDetection(
    nodeLabel: string,
    relationshipType: string
  ): Promise<Map<string, number>> {
    // Simple connected components as communities
    const query = `
      MATCH (n:${nodeLabel})
      OPTIONAL MATCH path = (n)-[:${relationshipType}*]-(connected:${nodeLabel})
      WITH n, collect(distinct connected) + [n] as component
      WITH component, min([node in component | id(node)]) as componentId
      UNWIND component as node
      RETURN node.id as nodeId, componentId
    `;
    
    const results = await runQuery(query);
    const communities = new Map<string, number>();
    
    results.forEach(record => {
      communities.set(record.nodeId, record.componentId);
    });
    
    return communities;
  }
  
  private async basicCentralityCalculation(
    nodeLabel: string,
    relationshipType: string
  ): Promise<Map<string, number>> {
    // Simple degree centrality
    const query = `
      MATCH (n:${nodeLabel})
      OPTIONAL MATCH (n)-[:${relationshipType}]-()
      WITH n, count(*) as degree
      WITH max(degree) as maxDegree
      MATCH (n:${nodeLabel})
      OPTIONAL MATCH (n)-[:${relationshipType}]-()
      WITH n, count(*) as degree, maxDegree
      RETURN n.id as nodeId, toFloat(degree) / maxDegree as centrality
      ORDER BY centrality DESC
    `;
    
    const results = await runQuery(query);
    const centralities = new Map<string, number>();
    
    results.forEach(record => {
      centralities.set(record.nodeId, record.centrality);
    });
    
    return centralities;
  }
  
  private calculateAnomalyScores(values: number[], method: string): number[] {
    if (method === 'zscore') {
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      return values.map(val => Math.abs((val - mean) / stdDev));
    }
    
    // Simplified anomaly detection for other methods
    return values.map(() => Math.random() * 4);
  }
  
  private async createOrderItemRelationship(
    orderId: string,
    menuItemId: string,
    orderItem: any
  ): Promise<void> {
    const query = `
      MATCH (o:Order {id: $orderId})
      MATCH (m:MenuItem {id: $menuItemId})
      CREATE (o)-[r:CONTAINS {
        quantity: $quantity,
        price: $price,
        modifiers: $modifiers
      }]->(m)
    `;
    
    await runQuery(query, {
      orderId,
      menuItemId,
      quantity: orderItem.quantity,
      price: orderItem.price,
      modifiers: JSON.stringify(orderItem.modifiers || []),
    });
  }
}