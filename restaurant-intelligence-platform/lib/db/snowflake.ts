import snowflake from 'snowflake-sdk';
import { promisify } from 'util';

let connection: any = null;

interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  database: string;
  schema: string;
  warehouse: string;
}

export async function getConnection() {
  if (!connection) {
    const config: SnowflakeConfig = {
      account: process.env.SNOWFLAKE_ACCOUNT || '',
      username: process.env.SNOWFLAKE_USERNAME || '',
      password: process.env.SNOWFLAKE_PASSWORD || '',
      database: process.env.SNOWFLAKE_DATABASE || '',
      schema: process.env.SNOWFLAKE_SCHEMA || 'PUBLIC',
      warehouse: process.env.SNOWFLAKE_WAREHOUSE || '',
    };
    
    connection = snowflake.createConnection(config);
    
    // Promisify the connect method
    const connectAsync = promisify(connection.connect).bind(connection);
    await connectAsync();
  }
  
  return connection;
}

export async function executeQuery<T = any>(
  query: string,
  binds?: any[]
): Promise<T[]> {
  const conn = await getConnection();
  
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: query,
      binds,
      complete: (err: any, stmt: any, rows: T[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      },
    });
  });
}

export async function streamQuery<T = any>(
  query: string,
  binds?: any[],
  onRow?: (row: T) => void
): Promise<void> {
  const conn = await getConnection();
  
  return new Promise((resolve, reject) => {
    const stream = conn.executeStream({
      sqlText: query,
      binds,
    });
    
    stream.on('data', (row: T) => {
      if (onRow) {
        onRow(row);
      }
    });
    
    stream.on('end', () => {
      resolve();
    });
    
    stream.on('error', (err: any) => {
      reject(err);
    });
  });
}

export async function closeConnection(): Promise<void> {
  if (connection) {
    const destroyAsync = promisify(connection.destroy).bind(connection);
    await destroyAsync();
    connection = null;
  }
}

// Helper functions for common operations
export const snowflakeHelpers = {
  async createTable(tableName: string, columns: Record<string, string>) {
    const columnDefs = Object.entries(columns)
      .map(([name, type]) => `${name} ${type}`)
      .join(', ');
      
    const query = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs})`;
    return await executeQuery(query);
  },
  
  async bulkInsert<T extends Record<string, any>>(
    tableName: string,
    records: T[]
  ) {
    if (records.length === 0) return;
    
    const columns = Object.keys(records[0]);
    const values = records.map(record =>
      `(${columns.map(col => {
        const val = record[col];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
        if (val instanceof Date) return `'${val.toISOString()}'`;
        return val;
      }).join(', ')})`
    ).join(', ');
    
    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${values}
    `;
    
    return await executeQuery(query);
  },
  
  async copyIntoS3(
    tableName: string,
    s3Path: string,
    format: 'CSV' | 'JSON' | 'PARQUET' = 'CSV'
  ) {
    const query = `
      COPY INTO '${s3Path}'
      FROM ${tableName}
      FILE_FORMAT = (TYPE = ${format})
      OVERWRITE = TRUE
    `;
    
    return await executeQuery(query);
  },
  
  async mergeData(
    targetTable: string,
    sourceTable: string,
    joinKeys: string[],
    updateColumns: string[]
  ) {
    const joinCondition = joinKeys
      .map(key => `target.${key} = source.${key}`)
      .join(' AND ');
      
    const updateSet = updateColumns
      .map(col => `${col} = source.${col}`)
      .join(', ');
      
    const insertColumns = [...joinKeys, ...updateColumns];
    const insertValues = insertColumns
      .map(col => `source.${col}`)
      .join(', ');
      
    const query = `
      MERGE INTO ${targetTable} AS target
      USING ${sourceTable} AS source
      ON ${joinCondition}
      WHEN MATCHED THEN
        UPDATE SET ${updateSet}
      WHEN NOT MATCHED THEN
        INSERT (${insertColumns.join(', ')})
        VALUES (${insertValues})
    `;
    
    return await executeQuery(query);
  },
  
  async getTableStats(tableName: string) {
    const query = `
      SELECT
        COUNT(*) as row_count,
        COUNT(DISTINCT *) as unique_rows,
        APPROX_COUNT_DISTINCT(*) as approx_unique,
        MIN(created_at) as earliest_record,
        MAX(created_at) as latest_record
      FROM ${tableName}
    `;
    
    const result = await executeQuery(query);
    return result[0];
  },
};