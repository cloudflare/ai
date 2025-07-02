import { getDriver, runQuery, runTransaction } from '../utils/neo4j-driver';
import { Result } from 'neo4j-driver';

export class Neo4jService {
  private database?: string;

  constructor(database?: string) {
    this.database = database;
  }

  async run(query: string, params: Record<string, any> = {}): Promise<Result> {
    return runQuery(query, params, this.database);
  }

  async runTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    return runTransaction(work, this.database);
  }

  async createNode(label: string, properties: Record<string, any>): Promise<string> {
    const result = await this.run(
      `CREATE (n:${label} $properties) RETURN n.id as id`,
      { properties }
    );
    return result.records[0].get('id');
  }

  async createRelationship(
    sourceId: string,
    targetId: string,
    relationshipType: string,
    properties?: Record<string, any>
  ): Promise<void> {
    await this.run(
      `
      MATCH (a {id: $sourceId}), (b {id: $targetId})
      CREATE (a)-[r:${relationshipType} $properties]->(b)
      `,
      { sourceId, targetId, properties: properties || {} }
    );
  }

  async findNode(label: string, properties: Record<string, any>): Promise<any | null> {
    const result = await this.run(
      `MATCH (n:${label} $properties) RETURN n LIMIT 1`,
      { properties }
    );
    return result.records.length > 0 ? result.records[0].get('n') : null;
  }

  async findNodes(label: string, properties?: Record<string, any>): Promise<any[]> {
    const query = properties
      ? `MATCH (n:${label} $properties) RETURN n`
      : `MATCH (n:${label}) RETURN n`;
    
    const result = await this.run(query, { properties: properties || {} });
    return result.records.map(record => record.get('n'));
  }

  async updateNode(id: string, properties: Record<string, any>): Promise<void> {
    await this.run(
      `
      MATCH (n {id: $id})
      SET n += $properties
      `,
      { id, properties }
    );
  }

  async deleteNode(id: string): Promise<void> {
    await this.run(
      `
      MATCH (n {id: $id})
      DETACH DELETE n
      `,
      { id }
    );
  }

  async getNodeWithRelationships(id: string): Promise<any> {
    const result = await this.run(
      `
      MATCH (n {id: $id})
      OPTIONAL MATCH (n)-[r]-(connected)
      RETURN n, collect({relationship: r, node: connected}) as connections
      `,
      { id }
    );

    if (result.records.length === 0) return null;

    return {
      node: result.records[0].get('n'),
      connections: result.records[0].get('connections')
    };
  }

  async searchNodes(searchTerm: string, labels?: string[]): Promise<any[]> {
    const labelConstraint = labels && labels.length > 0
      ? `:${labels.join('|')}`
      : '';

    const result = await this.run(
      `
      MATCH (n${labelConstraint})
      WHERE any(prop in keys(n) WHERE toString(n[prop]) CONTAINS $searchTerm)
      RETURN n
      LIMIT 100
      `,
      { searchTerm }
    );

    return result.records.map(record => record.get('n'));
  }

  async getGraphStats(): Promise<{
    nodeCount: number;
    relationshipCount: number;
    labels: string[];
    relationshipTypes: string[];
  }> {
    const [nodeResult, relResult, labelsResult, typesResult] = await Promise.all([
      this.run('MATCH (n) RETURN count(n) as count'),
      this.run('MATCH ()-[r]->() RETURN count(r) as count'),
      this.run('CALL db.labels() YIELD label RETURN collect(label) as labels'),
      this.run('CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) as types')
    ]);

    return {
      nodeCount: nodeResult.records[0]?.get('count').toNumber() || 0,
      relationshipCount: relResult.records[0]?.get('count').toNumber() || 0,
      labels: labelsResult.records[0]?.get('labels') || [],
      relationshipTypes: typesResult.records[0]?.get('types') || []
    };
  }
}