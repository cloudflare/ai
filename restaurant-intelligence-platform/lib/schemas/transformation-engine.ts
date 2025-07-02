import { z } from 'zod';
import { 
  SchemaFormat, 
  RestaurantEntity, 
  MenuItem, 
  Order, 
  Reservation,
  Employee,
  Shift
} from '@/lib/types';

export class SchemaTransformationEngine {
  private transformers: Map<string, (schema: any) => any> = new Map();
  
  constructor() {
    this.registerTransformers();
  }
  
  private registerTransformers() {
    // JSON Schema to Zod
    this.transformers.set('json-schema:zod', this.jsonSchemaToZod);
    
    // Zod to JSON Schema
    this.transformers.set('zod:json-schema', this.zodToJsonSchema);
    
    // GraphQL to TypeScript
    this.transformers.set('graphql:typescript', this.graphqlToTypeScript);
    
    // TypeScript to GraphQL
    this.transformers.set('typescript:graphql', this.typeScriptToGraphQL);
    
    // Zod to Cypher
    this.transformers.set('zod:cypher', this.zodToCypher);
    
    // GraphQL to Cypher
    this.transformers.set('graphql:cypher', this.graphqlToCypher);
    
    // Pydantic to Zod
    this.transformers.set('pydantic:zod', this.pydanticToZod);
    
    // Zod to Pydantic
    this.transformers.set('zod:pydantic', this.zodToPydantic);
  }
  
  async transform(
    sourceFormat: SchemaFormat,
    targetFormat: SchemaFormat,
    schema: string,
    options?: {
      validateSchema?: boolean;
      preserveComments?: boolean;
      formatting?: {
        indent?: number;
        lineWidth?: number;
      };
      namingConvention?: 'camelCase' | 'snake_case' | 'PascalCase';
    }
  ): Promise<string> {
    const key = `${sourceFormat}:${targetFormat}`;
    const transformer = this.transformers.get(key);
    
    if (!transformer) {
      throw new Error(`No transformer found for ${sourceFormat} to ${targetFormat}`);
    }
    
    try {
      const result = await transformer.call(this, schema, options);
      return this.formatOutput(result, options?.formatting);
    } catch (error) {
      throw new Error(`Transformation failed: ${error}`);
    }
  }
  
  private jsonSchemaToZod(schema: string): string {
    const jsonSchema = JSON.parse(schema);
    let zodSchema = 'import { z } from "zod";\n\n';
    
    const convertType = (obj: any, name: string): string => {
      if (obj.type === 'object' && obj.properties) {
        const properties = Object.entries(obj.properties)
          .map(([key, value]: [string, any]) => {
            const required = obj.required?.includes(key) ? '' : '.optional()';
            return `  ${key}: ${convertType(value, key)}${required}`;
          })
          .join(',\n');
          
        return `z.object({\n${properties}\n})`;
      }
      
      if (obj.type === 'array') {
        return `z.array(${convertType(obj.items, name)})`;
      }
      
      if (obj.type === 'string') {
        if (obj.format === 'email') return 'z.string().email()';
        if (obj.format === 'uri') return 'z.string().url()';
        if (obj.format === 'date-time') return 'z.string().datetime()';
        if (obj.enum) return `z.enum([${obj.enum.map((e: string) => `"${e}"`).join(', ')}])`;
        return 'z.string()';
      }
      
      if (obj.type === 'number') return 'z.number()';
      if (obj.type === 'boolean') return 'z.boolean()';
      if (obj.type === 'null') return 'z.null()';
      
      return 'z.any()';
    };
    
    zodSchema += `export const ${jsonSchema.title || 'Schema'} = ${convertType(jsonSchema, 'root')};`;
    
    return zodSchema;
  }
  
  private zodToJsonSchema(schema: string): string {
    // This is a simplified implementation
    // In production, you'd use a proper Zod to JSON Schema converter
    const jsonSchema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {},
      required: []
    };
    
    // Parse the Zod schema and extract structure
    // This would require proper AST parsing in production
    
    return JSON.stringify(jsonSchema, null, 2);
  }
  
  private graphqlToTypeScript(schema: string): string {
    let typescript = '';
    
    // Parse GraphQL schema
    const typeMatches = schema.matchAll(/type\s+(\w+)\s*{([^}]+)}/g);
    
    for (const match of typeMatches) {
      const typeName = match[1];
      const fields = match[2];
      
      typescript += `export interface ${typeName} {\n`;
      
      const fieldMatches = fields.matchAll(/(\w+):\s*([\w\[\]!]+)/g);
      for (const field of fieldMatches) {
        const fieldName = field[1];
        const fieldType = field[2];
        
        const tsType = this.graphqlTypeToTypeScript(fieldType);
        const optional = !fieldType.includes('!') ? '?' : '';
        
        typescript += `  ${fieldName}${optional}: ${tsType};\n`;
      }
      
      typescript += '}\n\n';
    }
    
    return typescript;
  }
  
  private graphqlTypeToTypeScript(graphqlType: string): string {
    let type = graphqlType.replace(/!/g, '');
    const isArray = type.includes('[');
    
    type = type.replace(/[\[\]]/g, '');
    
    const typeMap: Record<string, string> = {
      'String': 'string',
      'Int': 'number',
      'Float': 'number',
      'Boolean': 'boolean',
      'ID': 'string',
    };
    
    const tsType = typeMap[type] || type;
    
    return isArray ? `${tsType}[]` : tsType;
  }
  
  private typeScriptToGraphQL(schema: string): string {
    let graphql = '';
    
    // Parse TypeScript interfaces
    const interfaceMatches = schema.matchAll(/interface\s+(\w+)\s*{([^}]+)}/g);
    
    for (const match of interfaceMatches) {
      const typeName = match[1];
      const fields = match[2];
      
      graphql += `type ${typeName} {\n`;
      
      const fieldMatches = fields.matchAll(/(\w+)(\?)?:\s*([\w\[\]<>]+);/g);
      for (const field of fieldMatches) {
        const fieldName = field[1];
        const optional = field[2];
        const fieldType = field[3];
        
        const gqlType = this.typeScriptTypeToGraphQL(fieldType);
        const required = !optional ? '!' : '';
        
        graphql += `  ${fieldName}: ${gqlType}${required}\n`;
      }
      
      graphql += '}\n\n';
    }
    
    return graphql;
  }
  
  private typeScriptTypeToGraphQL(tsType: string): string {
    const isArray = tsType.includes('[]') || tsType.includes('Array<');
    let type = tsType.replace(/\[\]/g, '').replace(/Array<(.+)>/g, '$1');
    
    const typeMap: Record<string, string> = {
      'string': 'String',
      'number': 'Float',
      'boolean': 'Boolean',
      'Date': 'String',
    };
    
    const gqlType = typeMap[type] || type;
    
    return isArray ? `[${gqlType}]` : gqlType;
  }
  
  private zodToCypher(schema: string): string {
    // Extract the schema name and properties
    const schemaName = schema.match(/export const (\w+)/)?.[1] || 'Node';
    
    let cypher = `// Cypher constraints and indexes for ${schemaName}\n\n`;
    
    // Create node constraint
    cypher += `CREATE CONSTRAINT ${schemaName.toLowerCase()}_id IF NOT EXISTS\n`;
    cypher += `FOR (n:${schemaName})\n`;
    cypher += `REQUIRE n.id IS UNIQUE;\n\n`;
    
    // Create indexes for common query patterns
    cypher += `CREATE INDEX ${schemaName.toLowerCase()}_created_at IF NOT EXISTS\n`;
    cypher += `FOR (n:${schemaName})\n`;
    cypher += `ON (n.createdAt);\n\n`;
    
    // Create example node
    cypher += `// Example: Create a ${schemaName} node\n`;
    cypher += `CREATE (n:${schemaName} {\n`;
    cypher += `  id: randomUUID(),\n`;
    cypher += `  createdAt: datetime(),\n`;
    cypher += `  updatedAt: datetime()\n`;
    cypher += `})\n`;
    cypher += `RETURN n;\n`;
    
    return cypher;
  }
  
  private graphqlToCypher(schema: string): string {
    let cypher = '// Cypher schema from GraphQL\n\n';
    
    const typeMatches = schema.matchAll(/type\s+(\w+)\s*{([^}]+)}/g);
    
    for (const match of typeMatches) {
      const typeName = match[1];
      
      // Create constraint
      cypher += `CREATE CONSTRAINT ${typeName.toLowerCase()}_id IF NOT EXISTS\n`;
      cypher += `FOR (n:${typeName})\n`;
      cypher += `REQUIRE n.id IS UNIQUE;\n\n`;
    }
    
    return cypher;
  }
  
  private pydanticToZod(schema: string): string {
    let zodSchema = 'import { z } from "zod";\n\n';
    
    // Parse Pydantic model
    const classMatches = schema.matchAll(/class\s+(\w+).*?:\s*\n((?:\s{4}.+\n)+)/g);
    
    for (const match of classMatches) {
      const className = match[1];
      const fields = match[2];
      
      zodSchema += `export const ${className}Schema = z.object({\n`;
      
      const fieldMatches = fields.matchAll(/\s{4}(\w+):\s*(.+)/g);
      for (const field of fieldMatches) {
        const fieldName = field[1];
        const fieldType = field[2];
        
        const zodType = this.pydanticTypeToZod(fieldType);
        zodSchema += `  ${fieldName}: ${zodType},\n`;
      }
      
      zodSchema += '});\n\n';
      zodSchema += `export type ${className} = z.infer<typeof ${className}Schema>;\n\n`;
    }
    
    return zodSchema;
  }
  
  private pydanticTypeToZod(pydanticType: string): string {
    const typeMap: Record<string, string> = {
      'str': 'z.string()',
      'int': 'z.number().int()',
      'float': 'z.number()',
      'bool': 'z.boolean()',
      'datetime': 'z.date()',
      'date': 'z.date()',
      'UUID': 'z.string().uuid()',
      'EmailStr': 'z.string().email()',
      'HttpUrl': 'z.string().url()',
    };
    
    // Handle Optional types
    if (pydanticType.includes('Optional[')) {
      const innerType = pydanticType.match(/Optional\[(.+)\]/)?.[1] || 'str';
      return `${this.pydanticTypeToZod(innerType)}.optional()`;
    }
    
    // Handle List types
    if (pydanticType.includes('List[')) {
      const innerType = pydanticType.match(/List\[(.+)\]/)?.[1] || 'str';
      return `z.array(${this.pydanticTypeToZod(innerType)})`;
    }
    
    // Handle Dict types
    if (pydanticType.includes('Dict[')) {
      return 'z.record(z.any())';
    }
    
    // Handle literal types
    if (pydanticType.includes('Literal[')) {
      const values = pydanticType.match(/Literal\[(.+)\]/)?.[1] || '';
      const enumValues = values.split(',').map(v => v.trim());
      return `z.enum([${enumValues.join(', ')}])`;
    }
    
    return typeMap[pydanticType] || 'z.any()';
  }
  
  private zodToPydantic(schema: string): string {
    let pydanticSchema = 'from pydantic import BaseModel, Field\n';
    pydanticSchema += 'from typing import Optional, List, Dict, Any\n';
    pydanticSchema += 'from datetime import datetime\n';
    pydanticSchema += 'from uuid import UUID\n\n';
    
    // Parse Zod schema
    const schemaMatches = schema.matchAll(/export const (\w+)Schema = z\.object\({([^}]+)}\)/g);
    
    for (const match of schemaMatches) {
      const className = match[1];
      const fields = match[2];
      
      pydanticSchema += `class ${className}(BaseModel):\n`;
      
      const fieldMatches = fields.matchAll(/(\w+):\s*(.+?)(?:,|$)/g);
      for (const field of fieldMatches) {
        const fieldName = field[1];
        const fieldType = field[2].trim();
        
        const pydanticType = this.zodTypeToPydantic(fieldType);
        pydanticSchema += `    ${fieldName}: ${pydanticType}\n`;
      }
      
      pydanticSchema += '\n';
    }
    
    return pydanticSchema;
  }
  
  private zodTypeToPydantic(zodType: string): string {
    if (zodType.includes('z.string()')) return 'str';
    if (zodType.includes('z.number()')) return 'float';
    if (zodType.includes('z.number().int()')) return 'int';
    if (zodType.includes('z.boolean()')) return 'bool';
    if (zodType.includes('z.date()')) return 'datetime';
    if (zodType.includes('z.string().uuid()')) return 'UUID';
    if (zodType.includes('z.string().email()')) return 'EmailStr';
    if (zodType.includes('z.string().url()')) return 'HttpUrl';
    
    if (zodType.includes('.optional()')) {
      const innerType = zodType.replace('.optional()', '');
      return `Optional[${this.zodTypeToPydantic(innerType)}]`;
    }
    
    if (zodType.includes('z.array(')) {
      const innerType = zodType.match(/z\.array\((.+)\)/)?.[1] || 'z.any()';
      return `List[${this.zodTypeToPydantic(innerType)}]`;
    }
    
    if (zodType.includes('z.record(')) {
      return 'Dict[str, Any]';
    }
    
    if (zodType.includes('z.enum(')) {
      const values = zodType.match(/z\.enum\(\[(.+)\]\)/)?.[1] || '';
      return `Literal[${values}]`;
    }
    
    return 'Any';
  }
  
  private formatOutput(
    output: string, 
    formatting?: { indent?: number; lineWidth?: number }
  ): string {
    // Apply formatting if specified
    if (formatting?.indent) {
      // Adjust indentation
      const spaces = ' '.repeat(formatting.indent);
      output = output.replace(/^( {2})+/gm, (match) => {
        const level = match.length / 2;
        return spaces.repeat(level);
      });
    }
    
    return output;
  }
  
  // Restaurant-specific schema templates
  getRestaurantSchemaTemplates() {
    return {
      toast: {
        order: `
type ToastOrder {
  id: ID!
  guid: String!
  entityType: String!
  externalId: String
  openedDate: String!
  modifiedDate: String!
  promisedDate: String
  location: ToastLocation!
  table: ToastTable
  customer: ToastCustomer
  items: [ToastOrderItem!]!
  payments: [ToastPayment!]!
  subtotal: Float!
  tax: Float!
  total: Float!
  tipAmount: Float
}`,
        menuItem: `
type ToastMenuItem {
  id: ID!
  guid: String!
  name: String!
  description: String
  price: Float!
  category: ToastMenuCategory!
  modifiers: [ToastModifier!]
  available: Boolean!
  visibility: String!
}`,
      },
      openTable: {
        reservation: `
type OpenTableReservation {
  id: ID!
  confirmationNumber: String!
  restaurantId: String!
  partySize: Int!
  dateTime: String!
  status: ReservationStatus!
  customer: OpenTableCustomer!
  tableAssignment: OpenTableTable
  specialRequests: String
  tags: [String!]
}`,
        customer: `
type OpenTableCustomer {
  id: ID!
  firstName: String!
  lastName: String!
  email: String!
  phone: String
  vipStatus: Boolean!
  visitCount: Int!
  totalSpent: Float!
  preferences: CustomerPreferences
}`,
      },
      sevenShifts: {
        shift: `
type SevenShiftsShift {
  id: ID!
  employeeId: String!
  roleId: String!
  departmentId: String!
  startTime: String!
  endTime: String!
  status: ShiftStatus!
  wage: Float!
  breaks: [ShiftBreak!]
  notes: String
}`,
        employee: `
type SevenShiftsEmployee {
  id: ID!
  firstName: String!
  lastName: String!
  email: String!
  phoneNumber: String
  employeeId: String!
  roles: [EmployeeRole!]!
  departments: [Department!]!
  hourlyWage: Float!
  status: EmployeeStatus!
}`,
      },
    };
  }
}