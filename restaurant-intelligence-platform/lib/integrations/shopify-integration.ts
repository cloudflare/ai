import { IntegrationConfig, IntegrationResponse } from '@/lib/types/integrations';

interface ShopifyConfig extends IntegrationConfig {
  shopName: string;
  accessToken: string;
  apiVersion?: string;
}

interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  status: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

interface ShopifyVariant {
  id: string;
  product_id: string;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
  weight: number;
  weight_unit: string;
}

interface ShopifyImage {
  id: string;
  product_id: string;
  src: string;
  alt: string;
}

interface ShopifyOrder {
  id: string;
  email: string;
  created_at: string;
  total_price: string;
  currency: string;
  line_items: any[];
  customer: any;
  shipping_address: any;
  billing_address: any;
}

interface ShopifyCustomer {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
  updated_at: string;
  orders_count: number;
  total_spent: string;
  tags: string;
}

export class ShopifyIntegration {
  private config: ShopifyConfig;
  private baseUrl: string;
  private headers: HeadersInit;
  private retryCount: number = 3;
  private retryDelay: number = 1000;

  constructor(config: ShopifyConfig) {
    this.config = config;
    this.baseUrl = `https://${config.shopName}.myshopify.com/admin/api/${config.apiVersion || '2024-01'}`;
    this.headers = {
      'X-Shopify-Access-Token': config.accessToken,
      'Content-Type': 'application/json',
    };
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<IntegrationResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          ...options,
          headers: {
            ...this.headers,
            ...options.headers,
          },
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.retryDelay * (attempt + 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          success: true,
          data,
        };
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * (attempt + 1)));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Request failed after retries',
    };
  }

  async getProducts(params?: {
    limit?: number;
    page?: number;
    status?: string;
    vendor?: string;
    product_type?: string;
  }): Promise<IntegrationResponse<{ products: ShopifyProduct[] }>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.vendor) queryParams.append('vendor', params.vendor);
    if (params?.product_type) queryParams.append('product_type', params.product_type);

    return this.makeRequest<{ products: ShopifyProduct[] }>(
      `/products.json${queryParams.toString() ? `?${queryParams}` : ''}`
    );
  }

  async getProduct(productId: string): Promise<IntegrationResponse<{ product: ShopifyProduct }>> {
    return this.makeRequest<{ product: ShopifyProduct }>(`/products/${productId}.json`);
  }

  async createProduct(product: Partial<ShopifyProduct>): Promise<IntegrationResponse<{ product: ShopifyProduct }>> {
    return this.makeRequest<{ product: ShopifyProduct }>('/products.json', {
      method: 'POST',
      body: JSON.stringify({ product }),
    });
  }

  async updateProduct(
    productId: string,
    updates: Partial<ShopifyProduct>
  ): Promise<IntegrationResponse<{ product: ShopifyProduct }>> {
    return this.makeRequest<{ product: ShopifyProduct }>(`/products/${productId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ product: updates }),
    });
  }

  async deleteProduct(productId: string): Promise<IntegrationResponse<void>> {
    return this.makeRequest<void>(`/products/${productId}.json`, {
      method: 'DELETE',
    });
  }

  async getOrders(params?: {
    limit?: number;
    status?: string;
    financial_status?: string;
    fulfillment_status?: string;
    created_at_min?: string;
    created_at_max?: string;
  }): Promise<IntegrationResponse<{ orders: ShopifyOrder[] }>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.financial_status) queryParams.append('financial_status', params.financial_status);
    if (params?.fulfillment_status) queryParams.append('fulfillment_status', params.fulfillment_status);
    if (params?.created_at_min) queryParams.append('created_at_min', params.created_at_min);
    if (params?.created_at_max) queryParams.append('created_at_max', params.created_at_max);

    return this.makeRequest<{ orders: ShopifyOrder[] }>(
      `/orders.json${queryParams.toString() ? `?${queryParams}` : ''}`
    );
  }

  async getOrder(orderId: string): Promise<IntegrationResponse<{ order: ShopifyOrder }>> {
    return this.makeRequest<{ order: ShopifyOrder }>(`/orders/${orderId}.json`);
  }

  async getCustomers(params?: {
    limit?: number;
    created_at_min?: string;
    created_at_max?: string;
    updated_at_min?: string;
    updated_at_max?: string;
  }): Promise<IntegrationResponse<{ customers: ShopifyCustomer[] }>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.created_at_min) queryParams.append('created_at_min', params.created_at_min);
    if (params?.created_at_max) queryParams.append('created_at_max', params.created_at_max);
    if (params?.updated_at_min) queryParams.append('updated_at_min', params.updated_at_min);
    if (params?.updated_at_max) queryParams.append('updated_at_max', params.updated_at_max);

    return this.makeRequest<{ customers: ShopifyCustomer[] }>(
      `/customers.json${queryParams.toString() ? `?${queryParams}` : ''}`
    );
  }

  async getCustomer(customerId: string): Promise<IntegrationResponse<{ customer: ShopifyCustomer }>> {
    return this.makeRequest<{ customer: ShopifyCustomer }>(`/customers/${customerId}.json`);
  }

  async getInventoryLevels(params?: {
    location_ids?: string[];
    inventory_item_ids?: string[];
  }): Promise<IntegrationResponse<{ inventory_levels: any[] }>> {
    const queryParams = new URLSearchParams();
    if (params?.location_ids) queryParams.append('location_ids', params.location_ids.join(','));
    if (params?.inventory_item_ids) queryParams.append('inventory_item_ids', params.inventory_item_ids.join(','));

    return this.makeRequest<{ inventory_levels: any[] }>(
      `/inventory_levels.json${queryParams.toString() ? `?${queryParams}` : ''}`
    );
  }

  async updateInventoryLevel(
    inventoryItemId: string,
    locationId: string,
    available: number
  ): Promise<IntegrationResponse<{ inventory_level: any }>> {
    return this.makeRequest<{ inventory_level: any }>('/inventory_levels/set.json', {
      method: 'POST',
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available,
      }),
    });
  }

  async getShopInfo(): Promise<IntegrationResponse<{ shop: any }>> {
    return this.makeRequest<{ shop: any }>('/shop.json');
  }

  async getLocations(): Promise<IntegrationResponse<{ locations: any[] }>> {
    return this.makeRequest<{ locations: any[] }>('/locations.json');
  }

  // Mock data fallback when credentials are not configured
  async getMockData(endpoint: string): Promise<IntegrationResponse<any>> {
    const mockData: Record<string, any> = {
      products: {
        products: [
          {
            id: 'mock-1',
            title: 'Sample Product',
            description: 'This is a mock product for testing',
            vendor: 'Mock Vendor',
            product_type: 'Mock Type',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active',
            variants: [
              {
                id: 'variant-1',
                product_id: 'mock-1',
                title: 'Default',
                price: '29.99',
                sku: 'MOCK-001',
                inventory_quantity: 100,
                weight: 1.0,
                weight_unit: 'lb',
              },
            ],
            images: [
              {
                id: 'img-1',
                product_id: 'mock-1',
                src: 'https://via.placeholder.com/400x400',
                alt: 'Mock product image',
              },
            ],
          },
        ],
      },
      orders: {
        orders: [
          {
            id: 'order-1',
            email: 'customer@example.com',
            created_at: new Date().toISOString(),
            total_price: '29.99',
            currency: 'USD',
            line_items: [],
            customer: {
              id: 'customer-1',
              email: 'customer@example.com',
              first_name: 'John',
              last_name: 'Doe',
            },
            shipping_address: {},
            billing_address: {},
          },
        ],
      },
      customers: {
        customers: [
          {
            id: 'customer-1',
            email: 'customer@example.com',
            first_name: 'John',
            last_name: 'Doe',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            orders_count: 1,
            total_spent: '29.99',
            tags: 'mock-customer',
          },
        ],
      },
    };

    return {
      success: true,
      data: mockData[endpoint] || { message: 'Mock data not available for this endpoint' },
    };
  }
}

// Factory function with fallback to mock data
export async function createShopifyIntegration(
  config?: Partial<ShopifyConfig>
): Promise<ShopifyIntegration> {
  if (!config?.shopName || !config?.accessToken) {
    console.warn('Shopify credentials not configured, using mock data');
    return new ShopifyIntegration({
      shopName: 'mock-shop',
      accessToken: 'mock-token',
    });
  }

  return new ShopifyIntegration(config as ShopifyConfig);
}