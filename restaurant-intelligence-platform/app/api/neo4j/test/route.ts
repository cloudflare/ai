import { NextRequest, NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';

export async function POST(request: NextRequest) {
  let driver = null;
  
  try {
    const { uri, username, password, database } = await request.json();
    
    // Create driver with test configuration
    driver = neo4j.driver(
      uri,
      neo4j.auth.basic(username, password),
      {
        maxConnectionLifetime: 5 * 60 * 1000, // 5 minutes
        maxConnectionPoolSize: 10,
        connectionAcquisitionTimeout: 10 * 1000, // 10 seconds
      }
    );
    
    // Test connection
    const session = driver.session({
      database: database || 'neo4j',
    });
    
    try {
      // Run a simple query to test connection
      const result = await session.run(
        'CALL dbms.components() YIELD name, versions, edition RETURN name, versions[0] as version, edition',
        {},
        { timeout: 5000 }
      );
      
      const neo4jInfo = result.records[0];
      const version = neo4jInfo.get('version');
      const edition = neo4jInfo.get('edition');
      
      return NextResponse.json({
        success: true,
        version: version,
        edition: edition,
        message: 'Connection successful',
      });
      
    } finally {
      await session.close();
    }
    
  } catch (error) {
    console.error('Neo4j connection test failed:', error);
    
    let errorMessage = 'Connection failed';
    if (error instanceof Error) {
      if (error.message.includes('authentication')) {
        errorMessage = 'Authentication failed. Check username and password.';
      } else if (error.message.includes('ServiceUnavailable')) {
        errorMessage = 'Neo4j is not available at the specified URI.';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Connection timed out. Check URI and network.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 400 }
    );
    
  } finally {
    // Clean up driver
    if (driver) {
      await driver.close();
    }
  }
}