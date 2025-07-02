import { IntegrationConfig, IntegrationResponse } from '@/lib/types/integrations';

interface MetaConfig extends IntegrationConfig {
  appId: string;
  appSecret: string;
  accessToken?: string;
  pageId?: string;
  businessId?: string;
  apiVersion?: string;
}

interface MetaPage {
  id: string;
  name: string;
  category: string;
  category_list: Array<{ id: string; name: string }>;
  fan_count: number;
  link: string;
  picture: {
    data: {
      url: string;
    };
  };
  cover?: {
    source: string;
    offset_y: number;
  };
  phone?: string;
  emails?: string[];
  website?: string;
  location?: {
    street: string;
    city: string;
    state: string;
    country: string;
    zip: string;
    latitude: number;
    longitude: number;
  };
  hours?: Record<string, string>;
}

interface MetaPost {
  id: string;
  message?: string;
  created_time: string;
  updated_time: string;
  link?: string;
  type: string;
  shares?: {
    count: number;
  };
  likes?: {
    summary: {
      total_count: number;
    };
  };
  comments?: {
    summary: {
      total_count: number;
    };
  };
  reactions?: {
    summary: {
      total_count: number;
    };
  };
  attachments?: {
    data: Array<{
      description?: string;
      media?: {
        image: {
          src: string;
          width: number;
          height: number;
        };
      };
      target?: {
        url: string;
      };
      title?: string;
      type: string;
    }>;
  };
}

interface MetaInsight {
  name: string;
  period: string;
  values: Array<{
    value: number | Record<string, number>;
    end_time: string;
  }>;
  title: string;
  description: string;
  id: string;
}

interface MetaAdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
  amount_spent: string;
  balance: string;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  created_time: string;
  updated_time: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
  insights?: {
    data: Array<{
      impressions: string;
      clicks: string;
      spend: string;
      reach: string;
      cpm: string;
      cpc: string;
      ctr: string;
      date_start: string;
      date_stop: string;
    }>;
  };
}

export class MetaBusinessIntegration {
  private config: MetaConfig;
  private baseUrl: string;
  private headers: HeadersInit;

  constructor(config: MetaConfig) {
    this.config = config;
    this.baseUrl = `https://graph.facebook.com/${config.apiVersion || 'v18.0'}`;
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    // Always append access token if available
    if (this.config.accessToken) {
      url.searchParams.append('access_token', this.config.accessToken);
    }

    // Append additional parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    params?: Record<string, any>
  ): Promise<IntegrationResponse<T>> {
    try {
      const url = this.buildUrl(endpoint, params);
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.headers,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(
          errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
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

  // Page Management
  async getPage(pageId?: string): Promise<IntegrationResponse<MetaPage>> {
    const id = pageId || this.config.pageId || 'me';
    return this.makeRequest<MetaPage>(`/${id}`, {}, {
      fields: 'id,name,category,category_list,fan_count,link,picture,cover,phone,emails,website,location,hours',
    });
  }

  async updatePage(
    updates: Partial<MetaPage>,
    pageId?: string
  ): Promise<IntegrationResponse<{ success: boolean }>> {
    const id = pageId || this.config.pageId || 'me';
    return this.makeRequest<{ success: boolean }>(`/${id}`, {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  }

  // Posts Management
  async getPosts(params?: {
    pageId?: string;
    limit?: number;
    since?: string;
    until?: string;
  }): Promise<IntegrationResponse<{ data: MetaPost[]; paging?: any }>> {
    const id = params?.pageId || this.config.pageId || 'me';
    return this.makeRequest<{ data: MetaPost[]; paging?: any }>(`/${id}/posts`, {}, {
      fields: 'id,message,created_time,updated_time,link,type,shares,likes.summary(true),comments.summary(true),reactions.summary(true),attachments',
      limit: params?.limit || 25,
      since: params?.since,
      until: params?.until,
    });
  }

  async createPost(params: {
    message?: string;
    link?: string;
    photo?: string;
    video?: string;
    pageId?: string;
  }): Promise<IntegrationResponse<{ id: string }>> {
    const id = params.pageId || this.config.pageId || 'me';
    const endpoint = params.photo ? `/${id}/photos` : params.video ? `/${id}/videos` : `/${id}/feed`;
    
    const body: any = {};
    if (params.message) body.message = params.message;
    if (params.link) body.link = params.link;
    if (params.photo) body.url = params.photo;
    if (params.video) body.file_url = params.video;

    return this.makeRequest<{ id: string }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async deletePost(postId: string): Promise<IntegrationResponse<{ success: boolean }>> {
    return this.makeRequest<{ success: boolean }>(`/${postId}`, {
      method: 'DELETE',
    });
  }

  // Insights and Analytics
  async getPageInsights(params?: {
    pageId?: string;
    metrics?: string[];
    period?: 'day' | 'week' | 'days_28' | 'month' | 'lifetime';
    since?: string;
    until?: string;
  }): Promise<IntegrationResponse<{ data: MetaInsight[]; paging?: any }>> {
    const id = params?.pageId || this.config.pageId || 'me';
    const metrics = params?.metrics || [
      'page_impressions',
      'page_engaged_users',
      'page_post_engagements',
      'page_fan_adds',
      'page_views_total',
    ];

    return this.makeRequest<{ data: MetaInsight[]; paging?: any }>(`/${id}/insights`, {}, {
      metric: metrics.join(','),
      period: params?.period || 'day',
      since: params?.since,
      until: params?.until,
    });
  }

  async getPostInsights(
    postId: string,
    metrics?: string[]
  ): Promise<IntegrationResponse<{ data: MetaInsight[] }>> {
    const defaultMetrics = [
      'post_impressions',
      'post_engaged_users',
      'post_clicks',
      'post_reactions_by_type_total',
    ];

    return this.makeRequest<{ data: MetaInsight[] }>(`/${postId}/insights`, {}, {
      metric: (metrics || defaultMetrics).join(','),
    });
  }

  // Ads Management
  async getAdAccounts(
    businessId?: string
  ): Promise<IntegrationResponse<{ data: MetaAdAccount[] }>> {
    const id = businessId || this.config.businessId || 'me';
    return this.makeRequest<{ data: MetaAdAccount[] }>(`/${id}/adaccounts`, {}, {
      fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance',
    });
  }

  async getCampaigns(params: {
    adAccountId: string;
    status?: string[];
    limit?: number;
  }): Promise<IntegrationResponse<{ data: MetaCampaign[]; paging?: any }>> {
    return this.makeRequest<{ data: MetaCampaign[]; paging?: any }>(
      `/act_${params.adAccountId}/campaigns`,
      {},
      {
        fields: 'id,name,status,objective,created_time,updated_time,daily_budget,lifetime_budget,budget_remaining',
        filtering: params.status ? JSON.stringify([{ field: 'status', operator: 'IN', value: params.status }]) : undefined,
        limit: params.limit || 25,
      }
    );
  }

  async getCampaignInsights(params: {
    campaignId: string;
    datePreset?: string;
    timeRange?: { since: string; until: string };
  }): Promise<IntegrationResponse<{ data: any[] }>> {
    return this.makeRequest<{ data: any[] }>(`/${params.campaignId}/insights`, {}, {
      fields: 'impressions,clicks,spend,reach,cpm,cpc,ctr',
      date_preset: params.datePreset || 'last_30d',
      time_range: params.timeRange ? JSON.stringify(params.timeRange) : undefined,
    });
  }

  async createCampaign(params: {
    adAccountId: string;
    name: string;
    objective: string;
    status?: string;
    dailyBudget?: number;
    lifetimeBudget?: number;
  }): Promise<IntegrationResponse<{ id: string }>> {
    const body: any = {
      name: params.name,
      objective: params.objective,
      status: params.status || 'PAUSED',
    };

    if (params.dailyBudget) body.daily_budget = params.dailyBudget;
    if (params.lifetimeBudget) body.lifetime_budget = params.lifetimeBudget;

    return this.makeRequest<{ id: string }>(`/act_${params.adAccountId}/campaigns`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // OAuth2 flow methods
  getAuthUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: redirectUri,
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,ads_management,business_management,instagram_basic,instagram_content_publish',
      response_type: 'code',
      state: state || '',
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
  }

  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<IntegrationResponse<{
    access_token: string;
    token_type: string;
    expires_in?: number;
  }>> {
    return this.makeRequest<any>('/oauth/access_token', {}, {
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: redirectUri,
      code,
    });
  }

  async getLongLivedToken(
    shortLivedToken: string
  ): Promise<IntegrationResponse<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>> {
    return this.makeRequest<any>('/oauth/access_token', {}, {
      grant_type: 'fb_exchange_token',
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: shortLivedToken,
    });
  }

  // Mock data fallback
  async getMockData(endpoint: string): Promise<IntegrationResponse<any>> {
    const mockData: Record<string, any> = {
      page: {
        id: 'mock-page-id',
        name: 'Mock Restaurant Page',
        category: 'Restaurant',
        category_list: [{ id: '1', name: 'Restaurant' }],
        fan_count: 1234,
        link: 'https://facebook.com/mockrestaurant',
        picture: { data: { url: 'https://via.placeholder.com/200' } },
        location: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          country: 'United States',
          zip: '10001',
          latitude: 40.7128,
          longitude: -74.0060,
        },
      },
      posts: {
        data: [
          {
            id: 'mock-post-1',
            message: 'Check out our special menu for today!',
            created_time: new Date().toISOString(),
            updated_time: new Date().toISOString(),
            type: 'status',
            likes: { summary: { total_count: 45 } },
            comments: { summary: { total_count: 12 } },
            shares: { count: 5 },
          },
        ],
      },
      insights: {
        data: [
          {
            name: 'page_impressions',
            period: 'day',
            values: [{ value: 1500, end_time: new Date().toISOString() }],
            title: 'Daily Page Impressions',
            description: 'Daily: The number of times any content from your Page entered a person\'s screen.',
            id: 'mock-insight-1',
          },
        ],
      },
      campaigns: {
        data: [
          {
            id: 'mock-campaign-1',
            name: 'Summer Special Campaign',
            status: 'ACTIVE',
            objective: 'LINK_CLICKS',
            created_time: new Date().toISOString(),
            updated_time: new Date().toISOString(),
            daily_budget: '5000',
            budget_remaining: '4500',
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
export async function createMetaBusinessIntegration(
  config?: Partial<MetaConfig>
): Promise<MetaBusinessIntegration> {
  if (!config?.appId || !config?.appSecret) {
    console.warn('Meta Business credentials not configured, using mock data');
    return new MetaBusinessIntegration({
      appId: 'mock-app-id',
      appSecret: 'mock-app-secret',
    });
  }

  return new MetaBusinessIntegration(config as MetaConfig);
}