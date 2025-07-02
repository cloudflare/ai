import { z } from 'zod';
import { RestaurantPlatform, Order, MenuItem, RestaurantEntity } from '@/lib/types';
import { DataCanonicalizer } from '@/lib/utils/data-canonicalizer';

export interface ToastConfig {
  clientId: string;
  clientSecret: string;
  restaurantId: string;
  apiUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface ToastWebhookPayload {
  eventType: string;
  guid: string;
  timestamp: string;
  entityType: string;
  restaurantGuid: string;
  data: any;
}

export class ToastIntegration {
  private config: ToastConfig;
  private canonicalizer: DataCanonicalizer;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  constructor(config: ToastConfig) {
    this.config = {
      ...config,
      apiUrl: config.apiUrl || 'https://api.toasttab.com',
    };
    this.canonicalizer = new DataCanonicalizer();
  }
  
  // ==================== Authentication ====================
  
  async authenticate(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }
    
    const response = await fetch(`${this.config.apiUrl}/authentication/v1/authentication/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        userAccessType: 'TOAST_MACHINE_CLIENT',
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Toast authentication failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    this.accessToken = data.token.accessToken;
    this.tokenExpiry = new Date(Date.now() + (data.token.expiresIn * 1000));
    
    return this.accessToken;
  }
  
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const token = await this.authenticate();
    
    const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Toast-Restaurant-External-ID': this.config.restaurantId,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Toast API error: ${response.status} - ${error}`);
    }
    
    return response.json();
  }
  
  // ==================== Restaurant Data ====================
  
  async getRestaurant(): Promise<RestaurantEntity> {
    const data = await this.makeRequest(`/restaurants/v1/restaurants/${this.config.restaurantId}`);
    return this.canonicalizer.canonicalize(data, 'toast', 'restaurant');
  }
  
  async getLocations(): Promise<any[]> {
    const data = await this.makeRequest('/config/v2/locations');
    return data;
  }
  
  // ==================== Menu Management ====================
  
  async getMenus(): Promise<any[]> {
    const data = await this.makeRequest('/config/v2/menus');
    return data;
  }
  
  async getMenuItems(menuId?: string): Promise<MenuItem[]> {
    const endpoint = menuId 
      ? `/config/v2/menus/${menuId}/items`
      : '/config/v2/menuItems';
      
    const data = await this.makeRequest(endpoint);
    
    return Promise.all(
      data.map((item: any) => this.canonicalizer.canonicalize(item, 'toast', 'menuItem'))
    );
  }
  
  async getMenuCategories(): Promise<any[]> {
    const data = await this.makeRequest('/config/v2/menuCategories');
    return data;
  }
  
  async getModifierGroups(): Promise<any[]> {
    const data = await this.makeRequest('/config/v2/modifierGroups');
    return data;
  }
  
  // ==================== Orders ====================
  
  async getOrders(params?: {
    startDate?: Date;
    endDate?: Date;
    status?: string[];
    pageSize?: number;
    page?: number;
  }): Promise<Order[]> {
    const queryParams = new URLSearchParams();
    
    if (params?.startDate) {
      queryParams.append('startDate', params.startDate.toISOString());
    }
    if (params?.endDate) {
      queryParams.append('endDate', params.endDate.toISOString());
    }
    if (params?.status) {
      params.status.forEach(s => queryParams.append('status', s));
    }
    if (params?.pageSize) {
      queryParams.append('pageSize', params.pageSize.toString());
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    
    const data = await this.makeRequest(`/orders/v2/orders?${queryParams}`);
    
    return Promise.all(
      data.map((order: any) => this.canonicalizer.canonicalize(order, 'toast', 'order'))
    );
  }
  
  async getOrder(orderId: string): Promise<Order> {
    const data = await this.makeRequest(`/orders/v2/orders/${orderId}`);
    return this.canonicalizer.canonicalize(data, 'toast', 'order');
  }
  
  async createOrder(orderData: any): Promise<Order> {
    const data = await this.makeRequest('/orders/v2/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
    
    return this.canonicalizer.canonicalize(data, 'toast', 'order');
  }
  
  // ==================== Payments ====================
  
  async getPayments(orderId: string): Promise<any[]> {
    const data = await this.makeRequest(`/orders/v2/orders/${orderId}/payments`);
    return data;
  }
  
  async refundPayment(orderId: string, paymentId: string, amount: number): Promise<any> {
    const data = await this.makeRequest(`/orders/v2/orders/${orderId}/payments/${paymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
    
    return data;
  }
  
  // ==================== Labor & Employees ====================
  
  async getEmployees(params?: {
    pageSize?: number;
    page?: number;
    deleted?: boolean;
  }): Promise<any[]> {
    const queryParams = new URLSearchParams();
    
    if (params?.pageSize) {
      queryParams.append('pageSize', params.pageSize.toString());
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.deleted !== undefined) {
      queryParams.append('deleted', params.deleted.toString());
    }
    
    const data = await this.makeRequest(`/labor/v1/employees?${queryParams}`);
    return data;
  }
  
  async getShifts(params?: {
    startDate?: Date;
    endDate?: Date;
    employeeIds?: string[];
  }): Promise<any[]> {
    const queryParams = new URLSearchParams();
    
    if (params?.startDate) {
      queryParams.append('startDate', params.startDate.toISOString());
    }
    if (params?.endDate) {
      queryParams.append('endDate', params.endDate.toISOString());
    }
    if (params?.employeeIds) {
      params.employeeIds.forEach(id => queryParams.append('employeeId', id));
    }
    
    const data = await this.makeRequest(`/labor/v1/shifts?${queryParams}`);
    return data;
  }
  
  async getTimeEntries(params?: {
    startDate?: Date;
    endDate?: Date;
    employeeIds?: string[];
  }): Promise<any[]> {
    const queryParams = new URLSearchParams();
    
    if (params?.startDate) {
      queryParams.append('startDate', params.startDate.toISOString());
    }
    if (params?.endDate) {
      queryParams.append('endDate', params.endDate.toISOString());
    }
    if (params?.employeeIds) {
      params.employeeIds.forEach(id => queryParams.append('employeeId', id));
    }
    
    const data = await this.makeRequest(`/labor/v1/timeEntries?${queryParams}`);
    return data;
  }
  
  // ==================== Sales & Analytics ====================
  
  async getSalesReport(params: {
    startDate: Date;
    endDate: Date;
    groupBy?: 'day' | 'hour' | 'dayPart';
  }): Promise<any> {
    const queryParams = new URLSearchParams({
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
    });
    
    if (params.groupBy) {
      queryParams.append('groupBy', params.groupBy);
    }
    
    const data = await this.makeRequest(`/reports/v1/sales?${queryParams}`);
    return data;
  }
  
  async getCashReport(businessDate: Date): Promise<any> {
    const data = await this.makeRequest(`/reports/v1/cash/${businessDate.toISOString().split('T')[0]}`);
    return data;
  }
  
  // ==================== Inventory ====================
  
  async getInventoryItems(): Promise<any[]> {
    const data = await this.makeRequest('/inventory/v1/items');
    return data;
  }
  
  async getInventoryLevels(locationId?: string): Promise<any[]> {
    const endpoint = locationId 
      ? `/inventory/v1/locations/${locationId}/levels`
      : '/inventory/v1/levels';
      
    const data = await this.makeRequest(endpoint);
    return data;
  }
  
  async updateInventoryLevel(
    itemId: string,
    locationId: string,
    quantity: number,
    unit: string
  ): Promise<any> {
    const data = await this.makeRequest('/inventory/v1/levels', {
      method: 'PUT',
      body: JSON.stringify({
        itemId,
        locationId,
        quantity,
        unit,
      }),
    });
    
    return data;
  }
  
  // ==================== Webhooks ====================
  
  async validateWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    const crypto = await import('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
      
    return signature === expectedSignature;
  }
  
  async processWebhook(payload: ToastWebhookPayload): Promise<any> {
    const { eventType, entityType, data } = payload;
    
    switch (entityType) {
      case 'Order':
        return this.canonicalizer.canonicalize(data, 'toast', 'order');
        
      case 'MenuItem':
        return this.canonicalizer.canonicalize(data, 'toast', 'menuItem');
        
      case 'Employee':
        return this.canonicalizer.canonicalize(data, 'toast', 'employee');
        
      default:
        return data;
    }
  }
  
  // ==================== Sync Operations ====================
  
  async syncAll(options?: {
    includeOrders?: boolean;
    includeMenu?: boolean;
    includeEmployees?: boolean;
    includeInventory?: boolean;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    orders?: Order[];
    menuItems?: MenuItem[];
    employees?: any[];
    inventory?: any[];
  }> {
    const result: any = {};
    
    if (options?.includeOrders !== false) {
      result.orders = await this.getOrders({
        startDate: options?.startDate,
        endDate: options?.endDate,
      });
    }
    
    if (options?.includeMenu) {
      result.menuItems = await this.getMenuItems();
    }
    
    if (options?.includeEmployees) {
      result.employees = await this.getEmployees();
    }
    
    if (options?.includeInventory) {
      result.inventory = await this.getInventoryItems();
    }
    
    return result;
  }
  
  // ==================== Real-time Updates ====================
  
  async subscribeToUpdates(
    entityTypes: string[],
    onUpdate: (data: any) => void
  ): Promise<() => void> {
    // Toast doesn't have real-time subscriptions via API
    // Implement polling as fallback
    const intervals: NodeJS.Timeout[] = [];
    
    if (entityTypes.includes('orders')) {
      const interval = setInterval(async () => {
        try {
          const orders = await this.getOrders({
            startDate: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
          });
          orders.forEach(order => onUpdate({ type: 'order', data: order }));
        } catch (error) {
          console.error('Error polling orders:', error);
        }
      }, 30000); // Poll every 30 seconds
      
      intervals.push(interval);
    }
    
    // Return cleanup function
    return () => {
      intervals.forEach(interval => clearInterval(interval));
    };
  }
}