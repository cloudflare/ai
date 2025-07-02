import neo4j, { Driver, Session } from 'neo4j-driver';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const username = process.env.NEO4J_USERNAME || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || '';
    
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      maxConnectionLifetime: 60 * 60 * 1000, // 1 hour
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 60 * 1000, // 60 seconds
    });
  }
  
  return driver;
}

export async function runQuery<T = any>(
  query: string,
  params: Record<string, any> = {}
): Promise<T[]> {
  const driver = getDriver();
  const session = driver.session({
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });
  
  try {
    const result = await session.run(query, params);
    return result.records.map(record => record.toObject() as T);
  } finally {
    await session.close();
  }
}

export async function runTransaction<T = any>(
  work: (tx: any) => Promise<T>
): Promise<T> {
  const driver = getDriver();
  const session = driver.session({
    database: process.env.NEO4J_DATABASE || 'neo4j',
  });
  
  try {
    return await session.executeWrite(work);
  } finally {
    await session.close();
  }
}

export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

// Helper functions for common graph operations
export const graphHelpers = {
  async createNode(labels: string[], properties: Record<string, any>) {
    const labelString = labels.map(l => `:\`${l}\``).join('');
    const query = `
      CREATE (n${labelString})
      SET n = $properties
      SET n.createdAt = datetime()
      SET n.updatedAt = datetime()
      RETURN n
    `;
    
    const result = await runQuery(query, { properties });
    return result[0]?.n;
  },
  
  async createRelationship(
    sourceId: string,
    targetId: string,
    type: string,
    properties: Record<string, any> = {}
  ) {
    const query = `
      MATCH (source {id: $sourceId})
      MATCH (target {id: $targetId})
      CREATE (source)-[r:\`${type}\`]->(target)
      SET r = $properties
      SET r.createdAt = datetime()
      RETURN r
    `;
    
    const result = await runQuery(query, { sourceId, targetId, properties });
    return result[0]?.r;
  },
  
  async findShortestPath(startId: string, endId: string, maxHops: number = 5) {
    const query = `
      MATCH path = shortestPath((start {id: $startId})-[*..${maxHops}]-(end {id: $endId}))
      RETURN path
    `;
    
    const result = await runQuery(query, { startId, endId });
    return result[0]?.path;
  },
  
  async detectCommunities(label: string, relationshipType: string) {
    const query = `
      CALL gds.graph.project.cypher(
        'community-graph',
        'MATCH (n:\`${label}\`) RETURN id(n) AS id',
        'MATCH (n:\`${label}\`)-[r:\`${relationshipType}\`]->(m:\`${label}\`) RETURN id(n) AS source, id(m) AS target'
      );
      
      CALL gds.louvain.stream('community-graph')
      YIELD nodeId, communityId
      RETURN gds.util.asNode(nodeId).id AS nodeId, communityId
      ORDER BY communityId;
    `;
    
    try {
      return await runQuery(query);
    } catch (error) {
      console.warn('Community detection requires GDS plugin:', error);
      return [];
    }
  },
  
  async calculateCentrality(label: string, relationshipType: string) {
    const query = `
      MATCH (n:\`${label}\`)
      OPTIONAL MATCH (n)-[r:\`${relationshipType}\`]-()
      WITH n, COUNT(r) as degree
      RETURN n.id AS nodeId, degree
      ORDER BY degree DESC
    `;
    
    return await runQuery(query);
  },
};