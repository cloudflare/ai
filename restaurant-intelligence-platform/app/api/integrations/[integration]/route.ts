import { NextRequest, NextResponse } from 'next/server'
import { createShopifyIntegration } from '@/lib/integrations/shopify-integration'
import { createGoogleIntegration } from '@/lib/integrations/google-integration'
import { createMetaBusinessIntegration } from '@/lib/integrations/meta-business-integration'
import { FileHandler } from '@/lib/integrations/file-handler'
import { MediaGenerator } from '@/lib/integrations/media-generator'
import { Integration, IntegrationCredentials } from '@/lib/types/integrations'

// Mock database for demonstration
const integrationDB = new Map<string, Integration>()

// Initialize default integrations
const defaultIntegrations: Integration[] = [
  {
    id: 'shopify-1',
    name: 'Shopify Store',
    type: 'shopify',
    status: 'disconnected',
  },
  {
    id: 'google-1',
    name: 'Google Business',
    type: 'google',
    status: 'disconnected',
  },
  {
    id: 'meta-1',
    name: 'Meta Business',
    type: 'meta',
    status: 'disconnected',
  },
]

defaultIntegrations.forEach(int => integrationDB.set(int.id, int))

export async function GET(
  request: NextRequest,
  { params }: { params: { integration: string } }
) {
  const { integration } = params

  // Handle listing all integrations
  if (integration === 'list') {
    return NextResponse.json({
      integrations: Array.from(integrationDB.values()),
    })
  }

  // Handle getting specific integration details
  const integrationData = integrationDB.get(integration)
  if (!integrationData) {
    return NextResponse.json(
      { error: 'Integration not found' },
      { status: 404 }
    )
  }

  // Get integration-specific data
  try {
    let data = {}
    
    switch (integrationData.type) {
      case 'shopify':
        if (integrationData.status === 'connected' && integrationData.config) {
          const shopify = await createShopifyIntegration(integrationData.config)
          const products = await shopify.getProducts({ limit: 10 })
          const orders = await shopify.getOrders({ limit: 10 })
          data = { products: products.data, orders: orders.data }
        }
        break
        
      case 'google':
        if (integrationData.status === 'connected' && integrationData.config) {
          const google = await createGoogleIntegration(integrationData.config)
          // Would fetch actual data here
          data = { accounts: [], locations: [] }
        }
        break
        
      case 'meta':
        if (integrationData.status === 'connected' && integrationData.config) {
          const meta = await createMetaBusinessIntegration(integrationData.config)
          // Would fetch actual data here
          data = { pages: [], posts: [] }
        }
        break
    }

    return NextResponse.json({
      integration: integrationData,
      data,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch integration data' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { integration: string } }
) {
  const { integration } = params
  const body = await request.json()

  // Handle different integration actions
  const action = request.nextUrl.searchParams.get('action')

  switch (action) {
    case 'connect':
      return handleConnect(integration, body)
    case 'disconnect':
      return handleDisconnect(integration)
    case 'sync':
      return handleSync(integration)
    case 'webhook':
      return handleWebhook(integration, body)
    default:
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
  }
}

async function handleConnect(
  integrationType: string,
  credentials: Partial<IntegrationCredentials>
) {
  try {
    // Find integration by type
    const integration = Array.from(integrationDB.values()).find(
      int => int.type === integrationType
    )
    
    if (!integration) {
      return NextResponse.json(
        { error: 'Integration type not found' },
        { status: 404 }
      )
    }

    // Validate credentials based on integration type
    let validated = false
    let config: any = {}

    switch (integrationType) {
      case 'shopify':
        if (credentials.shopify?.shopName && credentials.shopify?.accessToken) {
          const shopify = await createShopifyIntegration(credentials.shopify)
          const shopInfo = await shopify.getShopInfo()
          validated = shopInfo.success
          config = credentials.shopify
        }
        break
        
      case 'google':
        if (credentials.google?.clientId && credentials.google?.clientSecret) {
          // For Google, we'd need to implement OAuth flow
          // For now, mark as pending
          validated = true
          config = credentials.google
          integration.status = 'pending'
        }
        break
        
      case 'meta':
        if (credentials.meta?.appId && credentials.meta?.appSecret) {
          // For Meta, we'd need to implement OAuth flow
          // For now, mark as pending
          validated = true
          config = credentials.meta
          integration.status = 'pending'
        }
        break
    }

    if (!validated) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 400 }
      )
    }

    // Update integration status
    integration.status = integration.status === 'pending' ? 'pending' : 'connected'
    integration.config = config
    integration.lastSync = new Date()
    integrationDB.set(integration.id, integration)

    // If OAuth is needed, return auth URL
    if (integration.status === 'pending') {
      let authUrl = ''
      
      if (integrationType === 'google') {
        const google = await createGoogleIntegration(config)
        authUrl = google.getAuthUrl(`${process.env.NEXT_PUBLIC_URL}/api/integrations/callback/google`)
      } else if (integrationType === 'meta') {
        const meta = await createMetaBusinessIntegration(config)
        authUrl = meta.getAuthUrl(`${process.env.NEXT_PUBLIC_URL}/api/integrations/callback/meta`)
      }

      return NextResponse.json({
        status: 'pending',
        authUrl,
        integration,
      })
    }

    return NextResponse.json({
      status: 'connected',
      integration,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to connect integration' },
      { status: 500 }
    )
  }
}

async function handleDisconnect(integrationId: string) {
  const integration = integrationDB.get(integrationId)
  
  if (!integration) {
    return NextResponse.json(
      { error: 'Integration not found' },
      { status: 404 }
    )
  }

  integration.status = 'disconnected'
  integration.config = undefined
  integration.error = undefined
  integrationDB.set(integrationId, integration)

  return NextResponse.json({
    status: 'disconnected',
    integration,
  })
}

async function handleSync(integrationId: string) {
  const integration = integrationDB.get(integrationId)
  
  if (!integration) {
    return NextResponse.json(
      { error: 'Integration not found' },
      { status: 404 }
    )
  }

  if (integration.status !== 'connected') {
    return NextResponse.json(
      { error: 'Integration not connected' },
      { status: 400 }
    )
  }

  try {
    // Perform sync based on integration type
    let syncResult: any = {}
    
    switch (integration.type) {
      case 'shopify':
        const shopify = await createShopifyIntegration(integration.config)
        const products = await shopify.getProducts({ limit: 50 })
        const orders = await shopify.getOrders({ limit: 50 })
        const customers = await shopify.getCustomers({ limit: 50 })
        
        syncResult = {
          products: products.data?.products?.length || 0,
          orders: orders.data?.orders?.length || 0,
          customers: customers.data?.customers?.length || 0,
        }
        break
        
      case 'google':
        // Implement Google sync
        syncResult = { synced: true }
        break
        
      case 'meta':
        // Implement Meta sync
        syncResult = { synced: true }
        break
    }

    integration.lastSync = new Date()
    integrationDB.set(integrationId, integration)

    return NextResponse.json({
      status: 'success',
      syncResult,
      integration,
    })
  } catch (error) {
    integration.error = (error as Error).message
    integrationDB.set(integrationId, integration)
    
    return NextResponse.json(
      { error: 'Sync failed', details: (error as Error).message },
      { status: 500 }
    )
  }
}

async function handleWebhook(integrationId: string, data: any) {
  const integration = integrationDB.get(integrationId)
  
  if (!integration) {
    return NextResponse.json(
      { error: 'Integration not found' },
      { status: 404 }
    )
  }

  // Process webhook based on integration type
  console.log(`Webhook received for ${integration.type}:`, data)

  // Here you would process the webhook data
  // For example, update local data, trigger actions, etc.

  return NextResponse.json({
    status: 'received',
    integration: integration.type,
  })
}

// Handle OAuth callbacks
export async function PATCH(
  request: NextRequest,
  { params }: { params: { integration: string } }
) {
  const { integration } = params
  const { code, state } = await request.json()

  try {
    // Find pending integration
    const integrationData = Array.from(integrationDB.values()).find(
      int => int.type === integration && int.status === 'pending'
    )
    
    if (!integrationData) {
      return NextResponse.json(
        { error: 'No pending integration found' },
        { status: 404 }
      )
    }

    let tokens: any = {}
    
    switch (integration) {
      case 'google':
        const google = await createGoogleIntegration(integrationData.config)
        const googleTokens = await google.exchangeCodeForTokens(
          code,
          `${process.env.NEXT_PUBLIC_URL}/api/integrations/callback/google`
        )
        if (googleTokens.success) {
          tokens = googleTokens.data
          integrationData.config = {
            ...integrationData.config,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
          }
        }
        break
        
      case 'meta':
        const meta = await createMetaBusinessIntegration(integrationData.config)
        const metaTokens = await meta.exchangeCodeForToken(
          code,
          `${process.env.NEXT_PUBLIC_URL}/api/integrations/callback/meta`
        )
        if (metaTokens.success) {
          tokens = metaTokens.data
          integrationData.config = {
            ...integrationData.config,
            accessToken: tokens.access_token,
          }
        }
        break
    }

    if (tokens.access_token) {
      integrationData.status = 'connected'
      integrationData.lastSync = new Date()
      integrationDB.set(integrationData.id, integrationData)
      
      return NextResponse.json({
        status: 'connected',
        integration: integrationData,
      })
    } else {
      return NextResponse.json(
        { error: 'Failed to exchange code for tokens' },
        { status: 400 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'OAuth callback failed' },
      { status: 500 }
    )
  }
}