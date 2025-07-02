'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, CheckCircle, XCircle, AlertCircle, Link, Unlink, Settings, RefreshCw, Plus } from 'lucide-react'
import { Integration, IntegrationCredentials, IntegrationLog } from '@/lib/types/integrations'

interface IntegrationManagerProps {
  onIntegrationChange?: (integrations: Integration[]) => void
}

export function IntegrationManager({ onIntegrationChange }: IntegrationManagerProps) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [credentials, setCredentials] = useState<Partial<IntegrationCredentials>>({})
  const [logs, setLogs] = useState<IntegrationLog[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)

  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    try {
      const response = await fetch('/api/integrations')
      if (response.ok) {
        const data = await response.json()
        setIntegrations(data.integrations)
        onIntegrationChange?.(data.integrations)
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchIntegrationLogs = async (integrationId: string) => {
    try {
      const response = await fetch(`/api/integrations/${integrationId}/logs`)
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs)
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    }
  }

  const handleConnect = (integration: Integration) => {
    setSelectedIntegration(integration)
    setShowCredentialsDialog(true)
  }

  const handleDisconnect = async (integrationId: string) => {
    try {
      const response = await fetch(`/api/integrations/${integrationId}/disconnect`, {
        method: 'POST',
      })
      
      if (response.ok) {
        await fetchIntegrations()
      }
    } catch (error) {
      console.error('Failed to disconnect integration:', error)
    }
  }

  const handleSaveCredentials = async () => {
    if (!selectedIntegration) return

    try {
      const response = await fetch(`/api/integrations/${selectedIntegration.type}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials[selectedIntegration.type as keyof IntegrationCredentials]),
      })

      if (response.ok) {
        setShowCredentialsDialog(false)
        setCredentials({})
        await fetchIntegrations()
      } else {
        const error = await response.json()
        alert(error.message || 'Failed to connect integration')
      }
    } catch (error) {
      console.error('Failed to save credentials:', error)
      alert('Failed to connect integration')
    }
  }

  const handleSync = async (integrationId: string) => {
    setSyncing(integrationId)
    try {
      const response = await fetch(`/api/integrations/${integrationId}/sync`, {
        method: 'POST',
      })

      if (response.ok) {
        await fetchIntegrations()
      }
    } catch (error) {
      console.error('Failed to sync integration:', error)
    } finally {
      setSyncing(null)
    }
  }

  const getStatusIcon = (status: Integration['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default:
        return <XCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: Integration['status']) => {
    const variants: Record<Integration['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
      connected: 'default',
      disconnected: 'secondary',
      error: 'destructive',
      pending: 'outline',
    }

    return (
      <Badge variant={variants[status]}>
        {status}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Integrations</h2>
          <Button onClick={() => fetchIntegrations()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {getStatusIcon(integration.status)}
                    {integration.name}
                  </CardTitle>
                  {getStatusBadge(integration.status)}
                </div>
                <CardDescription>
                  {integration.type.charAt(0).toUpperCase() + integration.type.slice(1)} Integration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {integration.error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{integration.error}</AlertDescription>
                    </Alert>
                  )}

                  {integration.lastSync && (
                    <div className="text-sm text-muted-foreground">
                      Last synced: {new Date(integration.lastSync).toLocaleString()}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {integration.status === 'connected' ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSync(integration.id)}
                          disabled={syncing === integration.id}
                        >
                          {syncing === integration.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          <span className="ml-2">Sync</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedIntegration(integration)
                            fetchIntegrationLogs(integration.id)
                          }}
                        >
                          <Settings className="h-4 w-4" />
                          <span className="ml-2">Settings</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDisconnect(integration.id)}
                        >
                          <Unlink className="h-4 w-4" />
                          <span className="ml-2">Disconnect</span>
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(integration)}
                      >
                        <Link className="h-4 w-4" />
                        <span className="ml-2">Connect</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Integration
              </CardTitle>
              <CardDescription>
                Connect more services to expand functionality
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        </div>

        {selectedIntegration && logs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Integration Logs - {selectedIntegration.name}</CardTitle>
              <CardDescription>Recent activity and sync history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 p-2 rounded-lg border"
                  >
                    {log.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />}
                    {log.status === 'error' && <XCircle className="h-4 w-4 text-red-500 mt-0.5" />}
                    {log.status === 'warning' && <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />}
                    <div className="flex-1">
                      <div className="text-sm font-medium">{log.action}</div>
                      <div className="text-sm text-muted-foreground">{log.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {selectedIntegration?.name}</DialogTitle>
            <DialogDescription>
              Enter your credentials to connect this integration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedIntegration?.type === 'shopify' && (
              <>
                <div>
                  <Label htmlFor="shopName">Shop Name</Label>
                  <Input
                    id="shopName"
                    placeholder="your-shop"
                    value={credentials.shopify?.shopName || ''}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        shopify: { ...credentials.shopify, shopName: e.target.value } as any,
                      })
                    }
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    The subdomain of your Shopify store (e.g., your-shop.myshopify.com)
                  </p>
                </div>
                <div>
                  <Label htmlFor="accessToken">Access Token</Label>
                  <Input
                    id="accessToken"
                    type="password"
                    placeholder="shpat_xxxxx"
                    value={credentials.shopify?.accessToken || ''}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        shopify: { ...credentials.shopify, accessToken: e.target.value } as any,
                      })
                    }
                  />
                </div>
              </>
            )}

            {selectedIntegration?.type === 'google' && (
              <>
                <div>
                  <Label htmlFor="clientId">Client ID</Label>
                  <Input
                    id="clientId"
                    placeholder="xxxxx.apps.googleusercontent.com"
                    value={credentials.google?.clientId || ''}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        google: { ...credentials.google, clientId: e.target.value } as any,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="clientSecret">Client Secret</Label>
                  <Input
                    id="clientSecret"
                    type="password"
                    placeholder="GOCSPX-xxxxx"
                    value={credentials.google?.clientSecret || ''}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        google: { ...credentials.google, clientSecret: e.target.value } as any,
                      })
                    }
                  />
                </div>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    After saving, you'll be redirected to Google to authorize access
                  </AlertDescription>
                </Alert>
              </>
            )}

            {selectedIntegration?.type === 'meta' && (
              <>
                <div>
                  <Label htmlFor="appId">App ID</Label>
                  <Input
                    id="appId"
                    placeholder="1234567890"
                    value={credentials.meta?.appId || ''}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        meta: { ...credentials.meta, appId: e.target.value } as any,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="appSecret">App Secret</Label>
                  <Input
                    id="appSecret"
                    type="password"
                    placeholder="xxxxx"
                    value={credentials.meta?.appSecret || ''}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        meta: { ...credentials.meta, appSecret: e.target.value } as any,
                      })
                    }
                  />
                </div>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    After saving, you'll be redirected to Facebook to authorize access
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCredentialsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCredentials}>
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}