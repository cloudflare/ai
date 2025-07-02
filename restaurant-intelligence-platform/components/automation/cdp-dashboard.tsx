'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CDPEngine, Customer, CustomerSegment } from '@/lib/automation/cdp-engine';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Target,
  Mail,
  MessageSquare,
  Bell,
  Activity,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  PieChart,
  LineChart,
  RefreshCw,
  Settings,
  Eye,
  PlayCircle,
  StopCircle,
  Edit,
  Trash,
  Plus,
  Download,
  Filter,
  Search,
} from 'lucide-react';
import { LineChart as RechartsLine, BarChart as RechartsBar, PieChart as RechartsPie, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Line, Bar, Cell } from 'recharts';

interface CDPDashboardProps {
  cdpEngine: CDPEngine;
  organizationId: string;
}

interface CustomerAnalytics {
  totalCustomers: number;
  segmentDistribution: Record<string, number>;
  journeyStageDistribution: Record<string, number>;
  churnRisk: {
    high: number;
    medium: number;
    low: number;
  };
  lifetimeValue: {
    average: number;
    median: number;
    top10Percent: number;
  };
}

interface CampaignMetrics {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'paused' | 'completed';
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  revenue: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  startDate: Date;
  endDate?: Date;
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export function CDPDashboard({ cdpEngine, organizationId }: CDPDashboardProps) {
  const [analytics, setAnalytics] = useState<CustomerAnalytics | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'segments' | 'journeys' | 'campaigns' | 'automation'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState('30d');

  useEffect(() => {
    loadAnalytics();
    loadCampaigns();
  }, [timeframe]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const data = await cdpEngine.getCustomerAnalytics();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCampaigns = async () => {
    // Mock campaign data - in real implementation, this would come from CDP engine
    const mockCampaigns: CampaignMetrics[] = [
      {
        id: 'camp_1',
        name: 'Welcome Series',
        type: 'email',
        status: 'active',
        sent: 1250,
        opened: 875,
        clicked: 175,
        converted: 87,
        revenue: 12500,
        openRate: 70,
        clickRate: 20,
        conversionRate: 7,
        startDate: new Date('2024-01-01'),
      },
      {
        id: 'camp_2',
        name: 'Retention Campaign',
        type: 'sms',
        status: 'active',
        sent: 850,
        opened: 765,
        clicked: 230,
        converted: 115,
        revenue: 8750,
        openRate: 90,
        clickRate: 27,
        conversionRate: 13.5,
        startDate: new Date('2024-01-15'),
      },
      {
        id: 'camp_3',
        name: 'VIP Offers',
        type: 'push',
        status: 'completed',
        sent: 320,
        opened: 288,
        clicked: 86,
        converted: 52,
        revenue: 7800,
        openRate: 90,
        clickRate: 30,
        conversionRate: 16.3,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      },
    ];
    setCampaigns(mockCampaigns);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics();
    await loadCampaigns();
    setRefreshing(false);
  };

  if (isLoading || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading CDP analytics...</p>
        </div>
      </div>
    );
  }

  const overviewMetrics = [
    {
      title: 'Total Customers',
      value: analytics.totalCustomers.toLocaleString(),
      change: '+12%',
      trend: 'up' as const,
      icon: Users,
      color: 'text-blue-600',
    },
    {
      title: 'Average LTV',
      value: `$${analytics.lifetimeValue.average.toFixed(2)}`,
      change: '+8%',
      trend: 'up' as const,
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      title: 'High Churn Risk',
      value: analytics.churnRisk.high.toString(),
      change: '-5%',
      trend: 'down' as const,
      icon: AlertTriangle,
      color: 'text-red-600',
    },
    {
      title: 'Active Campaigns',
      value: campaigns.filter(c => c.status === 'active').length.toString(),
      change: '+2',
      trend: 'up' as const,
      icon: Mail,
      color: 'text-purple-600',
    },
  ];

  const segmentChartData = Object.entries(analytics.segmentDistribution).map(([name, count]) => ({
    name,
    count,
    percentage: ((count / analytics.totalCustomers) * 100).toFixed(1),
  }));

  const churnRiskData = [
    { name: 'Low Risk', value: analytics.churnRisk.low, color: '#10b981' },
    { name: 'Medium Risk', value: analytics.churnRisk.medium, color: '#f59e0b' },
    { name: 'High Risk', value: analytics.churnRisk.high, color: '#ef4444' },
  ];

  const campaignPerformanceData = campaigns.map(campaign => ({
    name: campaign.name,
    openRate: campaign.openRate,
    clickRate: campaign.clickRate,
    conversionRate: campaign.conversionRate,
    revenue: campaign.revenue,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Customer Data Platform</h2>
          <p className="text-muted-foreground">
            Unified customer insights, segmentation, and automation
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {overviewMetrics.map((metric) => {
          const Icon = metric.icon;
          const isPositive = metric.trend === 'up';
          return (
            <Card key={metric.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {metric.title}
                    </p>
                    <p className="text-2xl font-bold">{metric.value}</p>
                    <div className="flex items-center mt-1">
                      {isPositive ? (
                        <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                      )}
                      <span className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {metric.change}
                      </span>
                    </div>
                  </div>
                  <Icon className={`w-8 h-8 ${metric.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="journeys">Journeys</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Segment Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PieChart className="w-5 h-5 mr-2" />
                  Customer Segments
                </CardTitle>
                <CardDescription>
                  Distribution of customers across segments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie
                      data={segmentChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="count"
                    >
                      {segmentChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </RechartsPie>
                    <Tooltip formatter={(value, name) => [`${value} customers`, name]} />
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {segmentChartData.map((segment, index) => (
                    <div key={segment.name} className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm">
                        {segment.name} ({segment.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Churn Risk Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  Churn Risk Analysis
                </CardTitle>
                <CardDescription>
                  Customer churn risk distribution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {churnRiskData.map((risk) => (
                    <div key={risk.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{risk.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {risk.value} customers
                        </span>
                      </div>
                      <Progress
                        value={(risk.value / analytics.totalCustomers) * 100}
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center">
                    <AlertTriangle className="w-4 h-4 text-red-600 mr-2" />
                    <span className="text-sm text-red-800">
                      {analytics.churnRisk.high} customers at high risk need immediate attention
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Campaign Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="w-5 h-5 mr-2" />
                Campaign Performance
              </CardTitle>
              <CardDescription>
                Key metrics across all active campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBar data={campaignPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="openRate" fill="#3b82f6" name="Open Rate (%)" />
                    <Bar yAxisId="left" dataKey="clickRate" fill="#10b981" name="Click Rate (%)" />
                    <Bar yAxisId="left" dataKey="conversionRate" fill="#f59e0b" name="Conversion Rate (%)" />
                  </RechartsBar>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segments" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Customer Segments</h3>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Segment
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(analytics.segmentDistribution).map(([name, count]) => (
              <Card key={name} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{name}</CardTitle>
                    <Badge variant="secondary">{count} customers</Badge>
                  </div>
                  <CardDescription>
                    {((count / analytics.totalCustomers) * 100).toFixed(1)}% of total customers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Progress value={(count / analytics.totalCustomers) * 100} />
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        <Edit className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="journeys" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Customer Journeys</h3>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Journey
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Journey Stage Distribution</CardTitle>
              <CardDescription>
                Where customers are in their journey
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(analytics.journeyStageDistribution).map(([stage, count]) => (
                  <div key={stage} className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium capitalize">{stage.replace('_', ' ')}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                    <Progress value={(count / analytics.totalCustomers) * 100} className="h-2" />
                    <p className="text-sm text-muted-foreground mt-2">
                      {((count / analytics.totalCustomers) * 100).toFixed(1)}% of customers
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Marketing Campaigns</h3>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Campaign
            </Button>
          </div>

          <div className="grid gap-6">
            {campaigns.map((campaign) => (
              <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center">
                        {campaign.type === 'email' && <Mail className="w-5 h-5 mr-2" />}
                        {campaign.type === 'sms' && <MessageSquare className="w-5 h-5 mr-2" />}
                        {campaign.type === 'push' && <Bell className="w-5 h-5 mr-2" />}
                        {campaign.name}
                      </CardTitle>
                      <CardDescription>
                        {campaign.type.toUpperCase()} campaign • Started {campaign.startDate.toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge
                        variant={campaign.status === 'active' ? 'default' : campaign.status === 'paused' ? 'secondary' : 'outline'}
                      >
                        {campaign.status}
                      </Badge>
                      <Button variant="outline" size="sm">
                        {campaign.status === 'active' ? (
                          <StopCircle className="w-4 h-4" />
                        ) : (
                          <PlayCircle className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{campaign.sent.toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">Sent</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{campaign.openRate}%</div>
                      <div className="text-sm text-muted-foreground">Open Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{campaign.clickRate}%</div>
                      <div className="text-sm text-muted-foreground">Click Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600">${campaign.revenue.toLocaleString()}</div>
                      <div className="text-sm text-muted-foreground">Revenue</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {campaign.converted} conversions ({campaign.conversionRate}%)
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="automation" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Marketing Automation</h3>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Automation
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Mock automation rules */}
            {[
              {
                id: 'auto_1',
                name: 'Welcome Series',
                trigger: 'New customer registration',
                status: 'active',
                customers: 245,
                conversions: 47,
              },
              {
                id: 'auto_2',
                name: 'Abandoned Cart Recovery',
                trigger: 'Cart abandoned for 24 hours',
                status: 'active',
                customers: 189,
                conversions: 38,
              },
              {
                id: 'auto_3',
                name: 'Win-back Campaign',
                trigger: 'No visit for 30 days',
                status: 'paused',
                customers: 156,
                conversions: 23,
              },
            ].map((automation) => (
              <Card key={automation.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{automation.name}</CardTitle>
                    <Badge variant={automation.status === 'active' ? 'default' : 'secondary'}>
                      {automation.status}
                    </Badge>
                  </div>
                  <CardDescription>{automation.trigger}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-xl font-bold text-blue-600">{automation.customers}</div>
                        <div className="text-xs text-muted-foreground">Customers</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-green-600">{automation.conversions}</div>
                        <div className="text-xs text-muted-foreground">Conversions</div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                      <Button variant="outline" size="sm">
                        {automation.status === 'active' ? (
                          <StopCircle className="w-4 h-4" />
                        ) : (
                          <PlayCircle className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}