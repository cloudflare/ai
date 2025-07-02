import neo4j, { Driver, Session, Result } from 'neo4j-driver';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

let driver: Driver | null = null;

export function initializeDriver(config: Neo4jConfig): Driver {
  if (driver) {
    driver.close();
  }

  driver = neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.username, config.password),
    {
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 2 * 60 * 1000, // 120 seconds
      logging: {
        level: 'info',
        logger: (level: string, message: string) => {
          console.log(`Neo4j ${level}: ${message}`);
        }
      }
    }
  );

  return driver;
}

export function getDriver(): Driver {
  if (!driver) {
    throw new Error('Neo4j driver not initialized. Call initializeDriver first.');
  }
  return driver;
}

export async function testNeo4jConnection(config: Neo4jConfig): Promise<boolean> {
  let testDriver: Driver | null = null;
  let session: Session | null = null;

  try {
    testDriver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password)
    );

    session = testDriver.session({
      database: config.database || 'neo4j',
      defaultAccessMode: neo4j.session.READ
    });

    // Test query
    const result = await session.run('RETURN 1 as test');
    
    return result.records.length > 0;
  } catch (error) {
    console.error('Neo4j connection test failed:', error);
    return false;
  } finally {
    if (session) await session.close();
    if (testDriver) await testDriver.close();
  }
}

export async function runQuery(
  query: string,
  params: Record<string, any> = {},
  database?: string
): Promise<Result> {
  const driver = getDriver();
  const session = driver.session({
    database: database || 'neo4j',
    defaultAccessMode: neo4j.session.WRITE
  });

  try {
    const result = await session.run(query, params);
    return result;
  } finally {
    await session.close();
  }
}

export async function runTransaction<T>(
  work: (tx: any) => Promise<T>,
  database?: string
): Promise<T> {
  const driver = getDriver();
  const session = driver.session({
    database: database || 'neo4j',
    defaultAccessMode: neo4j.session.WRITE
  });

  try {
    const result = await session.writeTransaction(work);
    return result;
  } finally {
    await session.close();
  }
}

export function parseConnectionString(connectionString: string): Partial<Neo4jConfig> {
  const config: Partial<Neo4jConfig> = {};

  // Parse Neo4j connection URLs
  const uriMatch = connectionString.match(/^(neo4j|bolt)(\+s)?:\/\/([^:]+):([^@]+)@(.+)$/);
  if (uriMatch) {
    const [, protocol, secure, username, password, host] = uriMatch;
    config.uri = `${protocol}${secure || ''}://${host}`;
    config.username = username;
    config.password = password;
  } else {
    // Try simple URI format
    const simpleMatch = connectionString.match(/^(neo4j|bolt)(\+s)?:\/\/(.+)$/);
    if (simpleMatch) {
      config.uri = connectionString;
    }
  }

  return config;
}

export async function getGraphStats(database?: string): Promise<{
  nodeCount: number;
  relationshipCount: number;
  labels: string[];
  relationshipTypes: string[];
}> {
  try {
    const [nodeResult, relResult, labelsResult, typesResult] = await Promise.all([
      runQuery('MATCH (n) RETURN count(n) as count', {}, database),
      runQuery('MATCH ()-[r]->() RETURN count(r) as count', {}, database),
      runQuery('CALL db.labels() YIELD label RETURN collect(label) as labels', {}, database),
      runQuery('CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) as types', {}, database)
    ]);

    return {
      nodeCount: nodeResult.records[0]?.get('count').toNumber() || 0,
      relationshipCount: relResult.records[0]?.get('count').toNumber() || 0,
      labels: labelsResult.records[0]?.get('labels') || [],
      relationshipTypes: typesResult.records[0]?.get('types') || []
    };
  } catch (error) {
    console.error('Error getting graph stats:', error);
    return {
      nodeCount: 0,
      relationshipCount: 0,
      labels: [],
      relationshipTypes: []
    };
  }
}

export function closeDriver(): void {
  if (driver) {
    driver.close();
    driver = null;
  }
}