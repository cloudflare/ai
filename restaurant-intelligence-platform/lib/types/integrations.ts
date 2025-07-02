export interface IntegrationConfig {
  apiKey?: string;
  [key: string]: any;
}

export interface IntegrationResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface Integration {
  id: string;
  name: string;
  type: 'shopify' | 'google' | 'meta' | 'openai' | 'stability' | 'file' | 'custom';
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  config?: IntegrationConfig;
  lastSync?: Date;
  error?: string;
}

export interface IntegrationCredentials {
  shopify?: {
    shopName: string;
    accessToken: string;
    apiVersion?: string;
  };
  google?: {
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
    accessToken?: string;
    apiKey?: string;
  };
  meta?: {
    appId: string;
    appSecret: string;
    accessToken?: string;
    pageId?: string;
    businessId?: string;
  };
  openai?: {
    apiKey: string;
  };
  stability?: {
    apiKey: string;
  };
}

export interface IntegrationAction {
  id: string;
  integrationId: string;
  name: string;
  description: string;
  type: 'fetch' | 'create' | 'update' | 'delete' | 'sync' | 'generate';
  parameters?: Record<string, any>;
}

export interface IntegrationWebhook {
  id: string;
  integrationId: string;
  event: string;
  url: string;
  secret?: string;
  active: boolean;
  createdAt: Date;
  lastTriggered?: Date;
}

export interface IntegrationLog {
  id: string;
  integrationId: string;
  action: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  data?: any;
  timestamp: Date;
}

export interface FileMetadata {
  id: string;
  name: string;
  originalName: string;
  size: number;
  type: string;
  extension: string;
  uploadedAt: Date;
  url?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, any>;
}

export interface MediaGenerationResult {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  model: string;
  metadata: {
    width?: number;
    height?: number;
    duration?: number;
    fileSize?: number;
    createdAt: Date;
  };
}

export interface MarketingContent {
  text: Record<string, string>;
  images?: MediaGenerationResult[];
  hashtags: string[];
  platforms: string[];
  campaign: string;
  tone: string;
}