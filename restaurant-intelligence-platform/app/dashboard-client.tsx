'use client';

import { Suspense, useState, useEffect } from 'react';
import { DashboardMetrics } from '@/components/dashboard/metrics';
import { AlertsPanel } from '@/components/dashboard/alerts-panel';
import { InsightsPanel } from '@/components/dashboard/insights-panel';
import { RealtimeChart } from '@/components/dashboard/realtime-chart';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { NaturalLanguageQuery } from '@/components/dashboard/natural-language-query';
import { AgentChat } from '@/components/ai/agent-chat';
import { ConnectionModal } from '@/components/neo4j/connection-modal';
import { TemplateGallery } from '@/components/templates/template-gallery';
import { CDPDashboard } from '@/components/automation/cdp-dashboard';
import { SmartOnboarding } from '@/components/onboarding/smart-onboarding';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { PageLoading } from '@/components/ui/loading-states';
import { ErrorState } from '@/components/ui/empty-states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CDPEngine } from '@/lib/automation/cdp-engine';
import { PlatformDefaultsManager } from '@/lib/defaults/platform-defaults';
import { 
  Database, 
  Bot, 
  Settings, 
  Sparkles, 
  Template, 
  Users, 
  Workflow, 
  Zap, 
  BarChart3,
  Target,
  Rocket,
  ChevronRight,
  CheckCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

interface DashboardClientProps {
  initialData: any;
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [dashboardData, setDashboardData] = useState<any>(initialData);
  const [showAgentChat, setShowAgentChat] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showCDPDashboard, setShowCDPDashboard] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'templates' | 'cdp' | 'automation'>('overview');
  const [cdpEngine, setCdpEngine] = useState<CDPEngine | null>(null);
  const [isFirstTime, setIsFirstTime] = useState(false);

  // Initialize CDP Engine
  useEffect(() => {
    const defaultsManager = new PlatformDefaultsManager();
    const cdpConfig = {
      dataSources: [],
      segmentationRules: [],
      journeyMaps: [],
      automations: [],
      integrations: [],
      privacy: defaultsManager.getDefaults('security').compliance,
    };
    
    const engine = new CDPEngine(cdpConfig as any);
    setCdpEngine(engine);

    // Check if this is a first-time user
    const hasCompletedOnboarding = localStorage.getItem('onboarding_completed');
    if (!hasCompletedOnboarding) {
      setIsFirstTime(true);
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboardingComplete = (config: any) => {
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('restaurant_config', JSON.stringify(config));
    setShowOnboarding(false);
    setIsFirstTime(false);
    // Refresh dashboard with new configuration
    window.location.reload();
  };

  const handleTemplateApply = (templateId: string, result: any) => {
    console.log('Template applied:', templateId, result);
    // Show success message and refresh relevant data
  };
  
  if (!dashboardData?.success) {
    return (
      <ResponsiveContainer className="min-h-screen-nav flex items-center justify-center">
        <ErrorState
          title="Failed to load dashboard"
          error="Unable to fetch dashboard data. Please check your connection."
          onRetry={() => window.location.reload()}
        />
      </ResponsiveContainer>
    );
  }

  const { metrics, alerts, insights, events, summary } = dashboardData.data || {};

  // Show onboarding for first-time users
  if (showOnboarding) {
    return (
      <SmartOnboarding
        onComplete={handleOnboardingComplete}
        organizationId="org_123" // In real app, get from auth context
      />
    );
  }

  return (
    <>
      {/* Enhanced Header with Navigation */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <ResponsiveContainer padding="sm">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Restaurant Intelligence Platform
              </h1>
              {!isFirstTime && (
                <Badge variant="outline" className="flex items-center space-x-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>Configured</span>
                </Badge>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTemplateGallery(true)}
              >
                <Template className="w-4 h-4 mr-2" />
                Templates
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('cdp')}
              >
                <Users className="w-4 h-4 mr-2" />
                CDP
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOnboarding(true)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Setup
              </Button>
              <button
                onClick={() => setShowConnectionModal(true)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Neo4j Connection"
              >
                <Database className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowAgentChat(!showAgentChat)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="AI Agent Chat"
              >
                <Bot className="w-5 h-5" />
              </button>
              <button
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </ResponsiveContainer>
      </div>

      <ResponsiveContainer className="py-6">
        {/* Quick Start for New Users */}
        {isFirstTime && (
          <Card className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900">Welcome to your Restaurant Intelligence Platform</h3>
                    <p className="text-blue-700 mt-1">Get started with our guided setup to unlock powerful insights for your restaurant.</p>
                  </div>
                </div>
                <Button onClick={() => setShowOnboarding(true)}>
                  <Rocket className="w-4 h-4 mr-2" />
                  Start Setup
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Platform Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center space-x-2">
              <Template className="w-4 h-4" />
              <span>Templates</span>
            </TabsTrigger>
            <TabsTrigger value="cdp" className="flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Customer CDP</span>
            </TabsTrigger>
            <TabsTrigger value="automation" className="flex items-center space-x-2">
              <Zap className="w-4 h-4" />
              <span>Automation</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            {/* AI Summary */}
            {summary && (
              <Card className="animate-fade-in-up">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Bot className="w-5 h-5 mr-2" />
                    AI Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Natural Language Query */}
            <div className="animate-fade-in-up">
              <NaturalLanguageQuery />
            </div>

            {/* Key Metrics */}
            <div className="animate-fade-in-up">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Key Metrics</h2>
              <Suspense fallback={<PageLoading title="Loading metrics..." />}>
                <DashboardMetrics metrics={metrics || []} />
              </Suspense>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Real-time Chart */}
              <div className="lg:col-span-2 animate-fade-in-up">
                <Card>
                  <CardHeader>
                    <CardTitle>Real-time Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<div className="animate-pulse h-64 bg-gray-100 dark:bg-gray-700 rounded" />}>
                      <RealtimeChart events={events || []} />
                    </Suspense>
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <div className="animate-fade-in-up">
                <QuickActions />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Active Alerts */}
              <div className="animate-fade-in-up">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Active Alerts</h2>
                <Suspense fallback={<div className="animate-pulse">Loading alerts...</div>}>
                  <AlertsPanel alerts={alerts || []} />
                </Suspense>
              </div>

              {/* AI Insights */}
              <div className="animate-fade-in-up">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">AI Insights</h2>
                <Suspense fallback={<div className="animate-pulse">Loading insights...</div>}>
                  <InsightsPanel insights={insights || []} />
                </Suspense>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="templates">
            <TemplateGallery
              onTemplateSelect={(template) => console.log('Selected:', template)}
              onTemplateApply={handleTemplateApply}
              organizationId="org_123"
            />
          </TabsContent>

          <TabsContent value="cdp">
            {cdpEngine ? (
              <CDPDashboard
                cdpEngine={cdpEngine}
                organizationId="org_123"
              />
            ) : (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Initializing Customer Data Platform</h3>
                  <p className="text-muted-foreground">Setting up your unified customer intelligence...</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="automation">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Automation Center</h2>
                <p className="text-muted-foreground">Manage workflows, triggers, and automated processes</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Workflow className="w-5 h-5 mr-2" />
                      Active Workflows
                    </CardTitle>
                    <CardDescription>
                      Automated business processes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">12</div>
                      <div className="text-sm text-muted-foreground">Running workflows</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Target className="w-5 h-5 mr-2" />
                      Triggers
                    </CardTitle>
                    <CardDescription>
                      Event-based automation triggers
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">34</div>
                      <div className="text-sm text-muted-foreground">Active triggers</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2" />
                      Performance
                    </CardTitle>
                    <CardDescription>
                      Automation success rate
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600">98.5%</div>
                      <div className="text-sm text-muted-foreground">Success rate</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Automation Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { name: 'Customer Welcome Email', status: 'success', time: '2 minutes ago' },
                      { name: 'Inventory Reorder Alert', status: 'success', time: '15 minutes ago' },
                      { name: 'Daily Sales Report', status: 'success', time: '1 hour ago' },
                      { name: 'Staff Schedule Optimizer', status: 'running', time: '2 hours ago' },
                    ].map((activity, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${
                            activity.status === 'success' ? 'bg-green-500' : 
                            activity.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-red-500'
                          }`} />
                          <span className="font-medium">{activity.name}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-muted-foreground">{activity.time}</span>
                          <Badge variant={activity.status === 'success' ? 'default' : 'secondary'}>
                            {activity.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </ResponsiveContainer>

      {/* AI Agent Chat Sidebar */}
      <div className={`fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out z-50 ${
        showAgentChat ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <AgentChat onClose={() => setShowAgentChat(false)} />
      </div>

      {/* Neo4j Connection Modal */}
      {showConnectionModal && (
        <ConnectionModal
          onClose={() => setShowConnectionModal(false)}
        />
      )}

      {/* Template Gallery Modal */}
      <Dialog open={showTemplateGallery} onOpenChange={setShowTemplateGallery}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Template Gallery</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[80vh]">
            <TemplateGallery
              onTemplateSelect={(template) => console.log('Selected:', template)}
              onTemplateApply={handleTemplateApply}
              organizationId="org_123"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}