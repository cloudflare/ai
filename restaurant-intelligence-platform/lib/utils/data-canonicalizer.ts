import { z } from 'zod';
import { 
  RestaurantEntity,
  MenuItem,
  Order,
  Reservation,
  Employee,
  Shift,
  RestaurantPlatform,
  DataFormat
} from '@/lib/types';
import { parse as parseCSV } from 'csv-parse/sync';
import { parse as parseXML } from 'fast-xml-parser';
import yaml from 'js-yaml';

export interface CanonicalMapping {
  sourceField: string;
  targetField: string;
  transformation?: (value: any) => any;
  required?: boolean;
  defaultValue?: any;
}

export interface PlatformSchema {
  platform: RestaurantPlatform;
  mappings: {
    restaurant?: CanonicalMapping[];
    menuItem?: CanonicalMapping[];
    order?: CanonicalMapping[];
    reservation?: CanonicalMapping[];
    employee?: CanonicalMapping[];
    shift?: CanonicalMapping[];
  };
  customTransformations?: Record<string, (data: any) => any>;
}

export class DataCanonicalizer {
  private platformSchemas: Map<RestaurantPlatform, PlatformSchema> = new Map();
  private validators: Map<string, z.ZodSchema> = new Map();
  
  constructor() {
    this.initializePlatformSchemas();
    this.initializeValidators();
  }
  
  private initializePlatformSchemas() {
    // Toast POS Schema
    this.platformSchemas.set('toast', {
      platform: 'toast',
      mappings: {
        restaurant: [
          { sourceField: 'guid', targetField: 'externalId' },
          { sourceField: 'name', targetField: 'name' },
          { sourceField: 'location.address1', targetField: 'address.street' },
          { sourceField: 'location.city', targetField: 'address.city' },
          { sourceField: 'location.state', targetField: 'address.state' },
          { sourceField: 'location.zipCode', targetField: 'address.zip' },
          { sourceField: 'phone', targetField: 'contact.phone' },
          { sourceField: 'email', targetField: 'contact.email' },
          { sourceField: 'website', targetField: 'contact.website' },
        ],
        menuItem: [
          { sourceField: 'guid', targetField: 'externalId' },
          { sourceField: 'name', targetField: 'name' },
          { sourceField: 'description', targetField: 'description' },
          { sourceField: 'price.amount', targetField: 'price', transformation: (v) => v / 100 },
          { sourceField: 'category.name', targetField: 'category' },
          { sourceField: 'modifierGroups', targetField: 'modifiers', transformation: this.transformToastModifiers },
          { sourceField: 'tags', targetField: 'tags' },
          { sourceField: 'visibility', targetField: 'available', transformation: (v) => v === 'visible' },
        ],
        order: [
          { sourceField: 'guid', targetField: 'externalOrderId' },
          { sourceField: 'entityType', targetField: 'orderType', transformation: this.mapToastOrderType },
          { sourceField: 'approvalStatus', targetField: 'status', transformation: this.mapToastOrderStatus },
          { sourceField: 'customer', targetField: 'customer', transformation: this.transformToastCustomer },
          { sourceField: 'checks', targetField: 'items', transformation: this.transformToastOrderItems },
          { sourceField: 'netAmount', targetField: 'subtotal', transformation: (v) => v / 100 },
          { sourceField: 'taxAmount', targetField: 'tax', transformation: (v) => v / 100 },
          { sourceField: 'tipAmount', targetField: 'tip', transformation: (v) => v / 100 },
          { sourceField: 'totalAmount', targetField: 'total', transformation: (v) => v / 100 },
          { sourceField: 'paymentType', targetField: 'paymentMethod' },
          { sourceField: 'createdDate', targetField: 'createdAt', transformation: (v) => new Date(v) },
          { sourceField: 'modifiedDate', targetField: 'updatedAt', transformation: (v) => new Date(v) },
        ],
      },
      customTransformations: {
        normalizePhoneNumber: (phone: string) => {
          return phone.replace(/\D/g, '').replace(/^1/, '');
        },
      },
    });
    
    // OpenTable Schema
    this.platformSchemas.set('opentable', {
      platform: 'opentable',
      mappings: {
        restaurant: [
          { sourceField: 'restaurantId', targetField: 'externalId' },
          { sourceField: 'restaurantName', targetField: 'name' },
          { sourceField: 'address', targetField: 'address.street' },
          { sourceField: 'city', targetField: 'address.city' },
          { sourceField: 'state', targetField: 'address.state' },
          { sourceField: 'postalCode', targetField: 'address.zip' },
          { sourceField: 'phoneNumber', targetField: 'contact.phone' },
          { sourceField: 'email', targetField: 'contact.email' },
          { sourceField: 'websiteUrl', targetField: 'contact.website' },
        ],
        reservation: [
          { sourceField: 'confirmationNumber', targetField: 'externalReservationId' },
          { sourceField: 'reservationStatus', targetField: 'status', transformation: this.mapOpenTableReservationStatus },
          { sourceField: 'guestDetails', targetField: 'customer', transformation: this.transformOpenTableGuest },
          { sourceField: 'partySize', targetField: 'partySize' },
          { sourceField: 'reservationDateTime', targetField: 'dateTime', transformation: (v) => new Date(v) },
          { sourceField: 'tableNumbers', targetField: 'tableIds' },
          { sourceField: 'specialRequests', targetField: 'notes' },
          { sourceField: 'createdDateTime', targetField: 'createdAt', transformation: (v) => new Date(v) },
          { sourceField: 'lastUpdatedDateTime', targetField: 'updatedAt', transformation: (v) => new Date(v) },
        ],
      },
    });
    
    // 7shifts Schema
    this.platformSchemas.set('7shifts', {
      platform: '7shifts',
      mappings: {
        employee: [
          { sourceField: 'id', targetField: 'externalEmployeeId' },
          { sourceField: 'first_name', targetField: 'firstName' },
          { sourceField: 'last_name', targetField: 'lastName' },
          { sourceField: 'email', targetField: 'email' },
          { sourceField: 'mobile_phone', targetField: 'phone' },
          { sourceField: 'role.name', targetField: 'role' },
          { sourceField: 'department.name', targetField: 'department' },
          { sourceField: 'wage.hourly_rate', targetField: 'hourlyRate' },
          { sourceField: 'active', targetField: 'status', transformation: (v) => v ? 'active' : 'inactive' },
          { sourceField: 'hire_date', targetField: 'hireDate', transformation: (v) => new Date(v) },
        ],
        shift: [
          { sourceField: 'id', targetField: 'externalShiftId' },
          { sourceField: 'user_id', targetField: 'employeeId' },
          { sourceField: 'start', targetField: 'startTime', transformation: (v) => new Date(v) },
          { sourceField: 'end', targetField: 'endTime', transformation: (v) => new Date(v) },
          { sourceField: 'role.name', targetField: 'role' },
          { sourceField: 'status', targetField: 'status', transformation: this.map7ShiftsShiftStatus },
          { sourceField: 'actual_start', targetField: 'actualStartTime', transformation: (v) => v ? new Date(v) : undefined },
          { sourceField: 'actual_end', targetField: 'actualEndTime', transformation: (v) => v ? new Date(v) : undefined },
          { sourceField: 'breaks', targetField: 'breaks', transformation: this.transform7ShiftsBreaks },
          { sourceField: 'notes', targetField: 'notes' },
        ],
      },
    });
  }
  
  private initializeValidators() {
    this.validators.set('restaurant', z.object({
      name: z.string().min(1),
      address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        zip: z.string(),
      }),
      contact: z.object({
        phone: z.string().optional(),
        email: z.string().email().optional(),
        website: z.string().url().optional(),
      }),
    }));
    
    this.validators.set('menuItem', z.object({
      name: z.string().min(1),
      price: z.number().min(0),
      category: z.string(),
      available: z.boolean(),
    }));
    
    this.validators.set('order', z.object({
      orderType: z.enum(['dine_in', 'takeout', 'delivery']),
      status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
      customer: z.object({
        name: z.string(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      }),
      total: z.number().min(0),
    }));
  }
  
  async canonicalize(
    data: any,
    platform: RestaurantPlatform,
    entityType: 'restaurant' | 'menuItem' | 'order' | 'reservation' | 'employee' | 'shift',
    format: DataFormat = 'json'
  ): Promise<any> {
    // Parse data based on format
    const parsedData = await this.parseData(data, format);
    
    // Get platform schema
    const platformSchema = this.platformSchemas.get(platform);
    if (!platformSchema) {
      throw new Error(`No schema defined for platform: ${platform}`);
    }
    
    // Get mappings for entity type
    const mappings = platformSchema.mappings[entityType];
    if (!mappings) {
      throw new Error(`No mappings defined for ${entityType} on platform ${platform}`);
    }
    
    // Transform data
    const canonicalData = this.transformData(parsedData, mappings);
    
    // Add platform and metadata
    canonicalData.platform = platform;
    canonicalData.id = canonicalData.id || `${platform}_${entityType}_${Date.now()}`;
    canonicalData.createdAt = canonicalData.createdAt || new Date();
    canonicalData.updatedAt = canonicalData.updatedAt || new Date();
    
    // Validate if validator exists
    const validator = this.validators.get(entityType);
    if (validator) {
      try {
        validator.parse(canonicalData);
      } catch (error) {
        console.warn(`Validation warning for ${entityType}:`, error);
        // Continue with partial data
      }
    }
    
    // Apply enrichments
    return await this.enrichData(canonicalData, entityType);
  }
  
  async canonicalizeBatch(
    dataArray: any[],
    platform: RestaurantPlatform,
    entityType: 'restaurant' | 'menuItem' | 'order' | 'reservation' | 'employee' | 'shift',
    format: DataFormat = 'json'
  ): Promise<any[]> {
    return Promise.all(
      dataArray.map(data => this.canonicalize(data, platform, entityType, format))
    );
  }
  
  private async parseData(data: any, format: DataFormat): Promise<any> {
    switch (format) {
      case 'json':
        return typeof data === 'string' ? JSON.parse(data) : data;
        
      case 'csv':
        const records = parseCSV(data, {
          columns: true,
          skip_empty_lines: true,
        });
        return records[0] || {};
        
      case 'xml':
        const xmlOptions = {
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          textNodeName: '#text',
        };
        return parseXML(data, xmlOptions);
        
      case 'yaml':
        return yaml.load(data);
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  private transformData(source: any, mappings: CanonicalMapping[]): any {
    const result: any = {};
    
    for (const mapping of mappings) {
      const value = this.getNestedValue(source, mapping.sourceField);
      
      if (value !== undefined && value !== null) {
        const transformedValue = mapping.transformation 
          ? mapping.transformation(value) 
          : value;
          
        this.setNestedValue(result, mapping.targetField, transformedValue);
      } else if (mapping.required) {
        if (mapping.defaultValue !== undefined) {
          this.setNestedValue(result, mapping.targetField, mapping.defaultValue);
        } else {
          console.warn(`Required field ${mapping.sourceField} is missing`);
        }
      }
    }
    
    return result;
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    
    const target = keys.reduce((current, key) => {
      if (!current[key]) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
  }
  
  private async enrichData(data: any, entityType: string): Promise<any> {
    const enriched = { ...data };
    
    // Add computed fields based on entity type
    switch (entityType) {
      case 'order':
        if (!enriched.subtotal && enriched.total && enriched.tax) {
          enriched.subtotal = enriched.total - enriched.tax - (enriched.tip || 0);
        }
        break;
        
      case 'employee':
        if (enriched.firstName && enriched.lastName) {
          enriched.name = `${enriched.firstName} ${enriched.lastName}`;
        }
        break;
        
      case 'shift':
        if (enriched.startTime && enriched.endTime) {
          enriched.duration = (enriched.endTime.getTime() - enriched.startTime.getTime()) / 1000 / 60 / 60;
        }
        break;
    }
    
    // Add metadata
    enriched.metadata = {
      ...enriched.metadata,
      canonicalizedAt: new Date(),
      version: '1.0.0',
    };
    
    return enriched;
  }
  
  // Transformation helper functions
  private transformToastModifiers(modifierGroups: any[]): any[] {
    if (!Array.isArray(modifierGroups)) return [];
    
    return modifierGroups.flatMap(group =>
      (group.modifiers || []).map((modifier: any) => ({
        id: modifier.guid,
        name: modifier.name,
        price: modifier.price?.amount ? modifier.price.amount / 100 : 0,
      }))
    );
  }
  
  private mapToastOrderType(entityType: string): string {
    const mapping: Record<string, string> = {
      'DineIn': 'dine_in',
      'TakeOut': 'takeout',
      'Delivery': 'delivery',
    };
    return mapping[entityType] || 'dine_in';
  }
  
  private mapToastOrderStatus(status: string): string {
    const mapping: Record<string, string> = {
      'NEEDS_APPROVAL': 'pending',
      'APPROVED': 'confirmed',
      'FUTURE': 'confirmed',
      'IN_PROGRESS': 'preparing',
      'READY': 'ready',
      'CLOSED': 'delivered',
      'VOIDED': 'cancelled',
    };
    return mapping[status] || 'pending';
  }
  
  private transformToastCustomer(customer: any): any {
    return {
      id: customer?.guid,
      name: `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Guest',
      email: customer?.email,
      phone: customer?.phone,
    };
  }
  
  private transformToastOrderItems(checks: any[]): any[] {
    if (!Array.isArray(checks)) return [];
    
    return checks.flatMap(check =>
      (check.selections || []).map((selection: any) => ({
        menuItemId: selection.item.guid,
        name: selection.item.name,
        quantity: selection.quantity || 1,
        price: selection.price?.amount ? selection.price.amount / 100 : 0,
        modifiers: (selection.modifiers || []).map((mod: any) => ({
          id: mod.guid,
          name: mod.name,
          price: mod.price?.amount ? mod.price.amount / 100 : 0,
        })),
      }))
    );
  }
  
  private mapOpenTableReservationStatus(status: string): string {
    const mapping: Record<string, string> = {
      'Booked': 'confirmed',
      'Seated': 'seated',
      'Completed': 'completed',
      'Cancelled': 'cancelled',
      'No Show': 'no_show',
    };
    return mapping[status] || 'pending';
  }
  
  private transformOpenTableGuest(guest: any): any {
    return {
      id: guest?.guestId,
      name: `${guest?.firstName || ''} ${guest?.lastName || ''}`.trim(),
      email: guest?.email,
      phone: guest?.phoneNumber,
    };
  }
  
  private map7ShiftsShiftStatus(status: string): string {
    const mapping: Record<string, string> = {
      'Draft': 'scheduled',
      'Published': 'scheduled',
      'In Progress': 'in_progress',
      'Complete': 'completed',
      'Deleted': 'cancelled',
    };
    return mapping[status] || 'scheduled';
  }
  
  private transform7ShiftsBreaks(breaks: any[]): any[] {
    if (!Array.isArray(breaks)) return [];
    
    return breaks.map(breakItem => ({
      startTime: new Date(breakItem.start),
      endTime: new Date(breakItem.end),
    }));
  }
  
  // Export configurations for external use
  exportMappings(platform: RestaurantPlatform): PlatformSchema | undefined {
    return this.platformSchemas.get(platform);
  }
  
  addCustomMapping(
    platform: RestaurantPlatform,
    entityType: string,
    mapping: CanonicalMapping
  ): void {
    const schema = this.platformSchemas.get(platform);
    if (schema && schema.mappings[entityType as keyof typeof schema.mappings]) {
      schema.mappings[entityType as keyof typeof schema.mappings]!.push(mapping);
    }
  }
}