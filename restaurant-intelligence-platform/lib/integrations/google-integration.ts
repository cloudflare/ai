import { IntegrationConfig, IntegrationResponse } from '@/lib/types/integrations';

interface GoogleConfig extends IntegrationConfig {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  accessToken?: string;
  apiKey?: string;
  scopes?: string[];
}

interface GoogleBusinessProfile {
  name: string;
  languageCode: string;
  storeCode?: string;
  title: string;
  phoneNumbers?: {
    primaryPhone?: string;
    additionalPhones?: string[];
  };
  categories?: {
    primaryCategory: {
      displayName: string;
      categoryId: string;
    };
    additionalCategories?: Array<{
      displayName: string;
      categoryId: string;
    }>;
  };
  storefrontAddress?: {
    addressLines: string[];
    locality: string;
    administrativeArea: string;
    postalCode: string;
    regionCode: string;
  };
  websiteUri?: string;
  regularHours?: {
    periods: Array<{
      openDay: string;
      openTime: string;
      closeDay: string;
      closeTime: string;
    }>;
  };
  specialHours?: {
    specialHourPeriods: Array<{
      startDate: string;
      openTime?: string;
      closeTime?: string;
      isClosed: boolean;
    }>;
  };
}

interface GoogleAnalyticsData {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

interface GoogleAnalyticsReport {
  rows: GoogleAnalyticsData[];
  totals: Record<string, number>;
  rowCount: number;
  metadata: {
    dataLossFromOtherRow: boolean;
    currencyCode: string;
    timeZone: string;
  };
}

interface GoogleReview {
  reviewId: string;
  reviewer: {
    profilePhotoUrl?: string;
    displayName: string;
  };
  starRating: number;
  comment: string;
  createTime: string;
  updateTime: string;
  reviewReply?: {
    comment: string;
    updateTime: string;
  };
}

export class GoogleIntegration {
  private config: GoogleConfig;
  private businessBaseUrl = 'https://mybusinessbusinessinformation.googleapis.com/v1';
  private analyticsBaseUrl = 'https://analyticsdata.googleapis.com/v1beta';
  private oauthBaseUrl = 'https://oauth2.googleapis.com/token';
  private headers: HeadersInit;

  constructor(config: GoogleConfig) {
    this.config = config;
    this.headers = {
      'Content-Type': 'application/json',
    };

    if (config.accessToken) {
      this.headers['Authorization'] = `Bearer ${config.accessToken}`;
    } else if (config.apiKey) {
      this.headers['X-Goog-Api-Key'] = config.apiKey;
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.config.refreshToken || !this.config.clientId || !this.config.clientSecret) {
      return false;
    }

    try {
      const response = await fetch(this.oauthBaseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.config.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      this.config.accessToken = data.access_token;
      this.headers['Authorization'] = `Bearer ${data.access_token}`;
      return true;
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      return false;
    }
  }

  private async makeRequest<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<IntegrationResponse<T>> {
    try {
      let response = await fetch(url, {
        ...options,
        headers: {
          ...this.headers,
          ...options.headers,
        },
      });

      // If unauthorized, try refreshing the access token
      if (response.status === 401 && this.config.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          response = await fetch(url, {
            ...options,
            headers: {
              ...this.headers,
              ...options.headers,
            },
          });
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  // Google My Business API methods
  async getBusinessAccounts(): Promise<IntegrationResponse<{ accounts: any[] }>> {
    return this.makeRequest<{ accounts: any[] }>(
      `${this.businessBaseUrl}/accounts`
    );
  }

  async getBusinessLocations(accountId: string): Promise<IntegrationResponse<{ locations: any[] }>> {
    return this.makeRequest<{ locations: any[] }>(
      `${this.businessBaseUrl}/accounts/${accountId}/locations`
    );
  }

  async getBusinessProfile(
    accountId: string,
    locationId: string
  ): Promise<IntegrationResponse<GoogleBusinessProfile>> {
    return this.makeRequest<GoogleBusinessProfile>(
      `${this.businessBaseUrl}/accounts/${accountId}/locations/${locationId}`
    );
  }

  async updateBusinessProfile(
    accountId: string,
    locationId: string,
    updates: Partial<GoogleBusinessProfile>
  ): Promise<IntegrationResponse<GoogleBusinessProfile>> {
    return this.makeRequest<GoogleBusinessProfile>(
      `${this.businessBaseUrl}/accounts/${accountId}/locations/${locationId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );
  }

  async getBusinessReviews(
    accountId: string,
    locationId: string,
    params?: {
      pageSize?: number;
      pageToken?: string;
      orderBy?: string;
    }
  ): Promise<IntegrationResponse<{ reviews: GoogleReview[]; nextPageToken?: string }>> {
    const queryParams = new URLSearchParams();
    if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params?.pageToken) queryParams.append('pageToken', params.pageToken);
    if (params?.orderBy) queryParams.append('orderBy', params.orderBy);

    return this.makeRequest<{ reviews: GoogleReview[]; nextPageToken?: string }>(
      `${this.businessBaseUrl}/accounts/${accountId}/locations/${locationId}/reviews${
        queryParams.toString() ? `?${queryParams}` : ''
      }`
    );
  }

  async replyToReview(
    accountId: string,
    locationId: string,
    reviewId: string,
    comment: string
  ): Promise<IntegrationResponse<GoogleReview>> {
    return this.makeRequest<GoogleReview>(
      `${this.businessBaseUrl}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`,
      {
        method: 'PUT',
        body: JSON.stringify({ comment }),
      }
    );
  }

  // Google Analytics Data API methods
  async getAnalyticsReport(
    propertyId: string,
    params: {
      startDate: string;
      endDate: string;
      dimensions?: string[];
      metrics?: string[];
      dimensionFilter?: any;
      metricFilter?: any;
      orderBys?: any[];
      limit?: number;
      offset?: number;
    }
  ): Promise<IntegrationResponse<GoogleAnalyticsReport>> {
    const requestBody = {
      dateRanges: [
        {
          startDate: params.startDate,
          endDate: params.endDate,
        },
      ],
      dimensions: params.dimensions?.map(name => ({ name })),
      metrics: params.metrics?.map(name => ({ name })),
      dimensionFilter: params.dimensionFilter,
      metricFilter: params.metricFilter,
      orderBys: params.orderBys,
      limit: params.limit,
      offset: params.offset,
    };

    return this.makeRequest<GoogleAnalyticsReport>(
      `${this.analyticsBaseUrl}/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }
    );
  }

  async getRealtimeReport(
    propertyId: string,
    params: {
      dimensions?: string[];
      metrics?: string[];
      dimensionFilter?: any;
      metricFilter?: any;
      limit?: number;
    }
  ): Promise<IntegrationResponse<GoogleAnalyticsReport>> {
    const requestBody = {
      dimensions: params.dimensions?.map(name => ({ name })),
      metrics: params.metrics?.map(name => ({ name })),
      dimensionFilter: params.dimensionFilter,
      metricFilter: params.metricFilter,
      limit: params.limit,
    };

    return this.makeRequest<GoogleAnalyticsReport>(
      `${this.analyticsBaseUrl}/properties/${propertyId}:runRealtimeReport`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }
    );
  }

  async getAnalyticsMetadata(propertyId: string): Promise<IntegrationResponse<{
    dimensions: Array<{ apiName: string; uiName: string; description: string }>;
    metrics: Array<{ apiName: string; uiName: string; description: string }>;
  }>> {
    return this.makeRequest<any>(
      `${this.analyticsBaseUrl}/properties/${propertyId}/metadata`
    );
  }

  // OAuth2 flow methods
  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.config.scopes?.join(' ') || 'https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/analytics.readonly',
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCodeForTokens(
    code: string,
    redirectUri: string
  ): Promise<IntegrationResponse<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>> {
    return this.makeRequest<any>(this.oauthBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
  }

  // Mock data fallback
  async getMockData(endpoint: string): Promise<IntegrationResponse<any>> {
    const mockData: Record<string, any> = {
      accounts: {
        accounts: [
          {
            name: 'accounts/mock-account',
            accountName: 'Mock Business',
            type: 'PERSONAL',
            state: 'VERIFIED',
            accountNumber: '123456789',
          },
        ],
      },
      locations: {
        locations: [
          {
            name: 'locations/mock-location',
            locationName: 'Mock Restaurant',
            primaryCategory: {
              displayName: 'Restaurant',
              categoryId: 'gcid:restaurant',
            },
            storefrontAddress: {
              addressLines: ['123 Main St'],
              locality: 'New York',
              administrativeArea: 'NY',
              postalCode: '10001',
              regionCode: 'US',
            },
          },
        ],
      },
      reviews: {
        reviews: [
          {
            reviewId: 'mock-review-1',
            reviewer: {
              displayName: 'John Doe',
              profilePhotoUrl: 'https://via.placeholder.com/50',
            },
            starRating: 5,
            comment: 'Great food and service!',
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
          },
        ],
      },
      analytics: {
        rows: [
          {
            dimensions: { date: '20240101', country: 'US' },
            metrics: { sessions: 100, pageviews: 250, users: 85 },
          },
        ],
        totals: { sessions: 100, pageviews: 250, users: 85 },
        rowCount: 1,
        metadata: {
          dataLossFromOtherRow: false,
          currencyCode: 'USD',
          timeZone: 'America/New_York',
        },
      },
    };

    return {
      success: true,
      data: mockData[endpoint] || { message: 'Mock data not available for this endpoint' },
    };
  }
}

// Factory function with fallback to mock data
export async function createGoogleIntegration(
  config?: Partial<GoogleConfig>
): Promise<GoogleIntegration> {
  if (!config?.clientId || !config?.clientSecret) {
    console.warn('Google credentials not configured, using mock data');
    return new GoogleIntegration({
      clientId: 'mock-client-id',
      clientSecret: 'mock-client-secret',
    });
  }

  return new GoogleIntegration(config as GoogleConfig);
}