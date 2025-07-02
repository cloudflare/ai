'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RestaurantTemplate, restaurantTemplates } from '@/lib/templates/restaurant-templates';
import { PlatformDefaultsManager, productionDefaults } from '@/lib/defaults/platform-defaults';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Star,
  Clock,
  Users,
  MapPin,
  Building2,
  CreditCard,
  Settings,
  Zap,
  Target,
  Rocket,
  CheckCircle,
  AlertCircle,
  Loader2,
  Play,
  ArrowRight,
  Lightbulb,
  Shield,
} from 'lucide-react';

interface SmartOnboardingProps {
  onComplete: (config: OnboardingConfig) => void;
  organizationId: string;
}

interface OnboardingConfig {
  restaurantInfo: RestaurantInfo;
  selectedTemplate: string;
  integrations: IntegrationSelection;
  features: FeatureSelection;
  defaults: any;
  completed: boolean;
}

interface RestaurantInfo {
  name: string;
  type: 'qsr' | 'casual' | 'fine_dining' | 'fast_casual' | 'ghost_kitchen' | 'multi_location';
  size: 'small' | 'medium' | 'large' | 'enterprise';
  locations: number;
  cuisine: string[];
  region: 'us' | 'ca' | 'eu' | 'uk';
  timezone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  businessHours: {
    [key: string]: {
      open: string;
      close: string;
      closed?: boolean;
    };
  };
  seatingCapacity?: number;
  avgCheckSize?: number;
  monthlyRevenue?: number;
}

interface IntegrationSelection {
  pos: { provider: string; enabled: boolean; priority: number };
  payment: { provider: string; enabled: boolean; priority: number };
  loyalty: { provider: string; enabled: boolean; priority: number };
  inventory: { provider: string; enabled: boolean; priority: number };
  scheduling: { provider: string; enabled: boolean; priority: number };
  accounting: { provider: string; enabled: boolean; priority: number };
  marketing: { provider: string; enabled: boolean; priority: number };
}

interface FeatureSelection {
  analytics: boolean;
  alerts: boolean;
  automation: boolean;
  reporting: boolean;
  cdp: boolean;
  reverseEtl: boolean;
  forecasting: boolean;
  benchmarking: boolean;
}

const ONBOARDING_STEPS = [
  'welcome',
  'restaurant-info',
  'template-selection',
  'integrations',
  'features',
  'configuration',
  'review',
  'completion',
] as const;

type OnboardingStep = typeof ONBOARDING_STEPS[number];

const RESTAURANT_TYPES = [
  {
    id: 'qsr',
    name: 'Quick Service Restaurant',
    description: 'Fast food, counter service, high volume',
    icon: '🍔',
    features: ['Speed optimization', 'High-volume analytics', 'Inventory automation'],
  },
  {
    id: 'fast_casual',
    name: 'Fast Casual',
    description: 'Counter service with premium ingredients',
    icon: '🌯',
    features: ['Order management', 'Quality tracking', 'Customer feedback'],
  },
  {
    id: 'casual',
    name: 'Casual Dining',
    description: 'Table service, moderate pricing',
    icon: '🍽️',
    features: ['Table management', 'Staff scheduling', 'Guest analytics'],
  },
  {
    id: 'fine_dining',
    name: 'Fine Dining',
    description: 'Premium experience, table service',
    icon: '🍷',
    features: ['Guest profiles', 'Wine management', 'Experience tracking'],
  },
  {
    id: 'ghost_kitchen',
    name: 'Ghost Kitchen',
    description: 'Delivery-only, multi-brand operations',
    icon: '👻',
    features: ['Delivery optimization', 'Multi-brand analytics', 'Kitchen efficiency'],
  },
  {
    id: 'multi_location',
    name: 'Multi-Location Chain',
    description: 'Multiple restaurants, centralized management',
    icon: '🏢',
    features: ['Location benchmarking', 'Chain analytics', 'Central reporting'],
  },
];

const INTEGRATION_PROVIDERS = {
  pos: [
    { id: 'toast', name: 'Toast POS', logo: '🍞', description: 'Complete restaurant platform' },
    { id: 'square', name: 'Square', logo: '■️', description: 'Point of sale and payments' },
    { id: 'clover', name: 'Clover', logo: '🍀', description: 'Business management platform' },
    { id: 'lightspeed', name: 'Lightspeed', logo: '⚡', description: 'Retail and restaurant POS' },
  ],
  payment: [
    { id: 'stripe', name: 'Stripe', logo: '💳', description: 'Online payment processing' },
    { id: 'square_payments', name: 'Square Payments', logo: '■️', description: 'Integrated payments' },
    { id: 'paypal', name: 'PayPal', logo: '💰', description: 'Digital payments' },
  ],
  loyalty: [
    { id: 'toast_loyalty', name: 'Toast Loyalty', logo: '🍞', description: 'Integrated loyalty program' },
    { id: 'fivestars', name: 'Fivestars', logo: '⭐', description: 'Customer loyalty platform' },
    { id: 'belly', name: 'Belly', logo: '🐷', description: 'Digital loyalty program' },
  ],
  inventory: [
    { id: 'toast_inventory', name: 'Toast Inventory', logo: '🍞', description: 'Integrated inventory' },
    { id: 'food_trak', name: 'Food Trak', logo: '📦', description: 'Inventory management' },
    { id: 'marketman', name: 'MarketMan', logo: '📊', description: 'Food cost control' },
  ],
  scheduling: [
    { id: '7shifts', name: '7shifts', logo: '📅', description: 'Employee scheduling' },
    { id: 'when_i_work', name: 'When I Work', logo: '⏰', description: 'Team scheduling' },
    { id: 'homebase', name: 'Homebase', logo: '🏠', description: 'Workforce management' },
  ],
  accounting: [
    { id: 'quickbooks', name: 'QuickBooks', logo: '💼', description: 'Business accounting' },
    { id: 'xero', name: 'Xero', logo: '🧮', description: 'Cloud accounting' },
    { id: 'sage', name: 'Sage', logo: '🌿', description: 'Business management' },
  ],
  marketing: [
    { id: 'mailchimp', name: 'Mailchimp', logo: '🐵', description: 'Email marketing' },
    { id: 'hubspot', name: 'HubSpot', logo: '🗣️', description: 'CRM and marketing' },
    { id: 'constant_contact', name: 'Constant Contact', logo: '📧', description: 'Email marketing' },
  ],
};

export function SmartOnboarding({ onComplete, organizationId }: SmartOnboardingProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [config, setConfig] = useState<OnboardingConfig>({
    restaurantInfo: {
      name: '',
      type: 'casual',
      size: 'small',
      locations: 1,
      cuisine: [],
      region: 'us',
      timezone: 'America/New_York',
      address: {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'US',
      },
      businessHours: {
        monday: { open: '11:00', close: '22:00' },
        tuesday: { open: '11:00', close: '22:00' },
        wednesday: { open: '11:00', close: '22:00' },
        thursday: { open: '11:00', close: '22:00' },
        friday: { open: '11:00', close: '23:00' },
        saturday: { open: '10:00', close: '23:00' },
        sunday: { open: '10:00', close: '22:00' },
      },
    },
    selectedTemplate: '',
    integrations: {
      pos: { provider: '', enabled: false, priority: 1 },
      payment: { provider: '', enabled: false, priority: 2 },
      loyalty: { provider: '', enabled: false, priority: 3 },
      inventory: { provider: '', enabled: false, priority: 4 },
      scheduling: { provider: '', enabled: false, priority: 5 },
      accounting: { provider: '', enabled: false, priority: 6 },
      marketing: { provider: '', enabled: false, priority: 7 },
    },
    features: {
      analytics: true,
      alerts: true,
      automation: false,
      reporting: true,
      cdp: false,
      reverseEtl: false,
      forecasting: false,
      benchmarking: true,
    },
    defaults: productionDefaults,
    completed: false,
  });
  
  const [loading, setLoading] = useState(false);
  const [recommendedTemplate, setRecommendedTemplate] = useState<RestaurantTemplate | null>(null);
  const [estimatedSetupTime, setEstimatedSetupTime] = useState(0);

  const currentStepIndex = ONBOARDING_STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / ONBOARDING_STEPS.length) * 100;

  // Auto-recommend template based on restaurant info
  useEffect(() => {
    if (config.restaurantInfo.type && config.restaurantInfo.size) {
      const templateMap: Record<string, string> = {
        'qsr': 'quick-service-restaurant',
        'fast_casual': 'quick-service-restaurant',
        'casual': 'multi-location-chain',
        'fine_dining': 'fine-dining',
        'ghost_kitchen': 'ghost-kitchen',
        'multi_location': 'multi-location-chain',
      };
      
      const templateId = templateMap[config.restaurantInfo.type];
      const template = restaurantTemplates.find(t => t.id === templateId);
      
      if (template) {
        setRecommendedTemplate(template);
        setConfig(prev => ({
          ...prev,
          selectedTemplate: template.id,
        }));
      }
    }
  }, [config.restaurantInfo.type, config.restaurantInfo.size]);

  // Calculate estimated setup time
  useEffect(() => {
    const baseTime = 30; // Base setup time
    const integrationTime = Object.values(config.integrations)
      .filter(int => int.enabled).length * 15;
    const featureTime = Object.values(config.features)
      .filter(Boolean).length * 10;
    
    setEstimatedSetupTime(baseTime + integrationTime + featureTime);
  }, [config.integrations, config.features]);

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < ONBOARDING_STEPS.length) {
      setCurrentStep(ONBOARDING_STEPS[nextIndex]);
    }
  };

  const handlePrevious = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(ONBOARDING_STEPS[prevIndex]);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    
    try {
      // Apply smart defaults based on restaurant configuration
      const defaultsManager = new PlatformDefaultsManager();
      const smartDefaults = defaultsManager.override({
        ...defaultsManager.getRestaurantTypeDefaults(config.restaurantInfo.type),
        ...defaultsManager.getRestaurantSizeDefaults(config.restaurantInfo.size),
        ...defaultsManager.getRegionalDefaults(config.restaurantInfo.region),
      });
      
      const finalConfig = {
        ...config,
        defaults: smartDefaults,
        completed: true,
      };
      
      // Simulate setup process
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      onComplete(finalConfig);
    } catch (error) {
      console.error('Onboarding completion failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold">Welcome to Restaurant Intelligence Platform</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Let's set up your restaurant intelligence platform in just a few minutes. 
                We'll configure everything based on your specific needs.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <Card className="text-center">
                <CardContent className="pt-6">
                  <Zap className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Smart Setup</h3>
                  <p className="text-sm text-muted-foreground">
                    Intelligent configuration based on your restaurant type and size
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-center">
                <CardContent className="pt-6">
                  <Target className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Pre-built Templates</h3>
                  <p className="text-sm text-muted-foreground">
                    Industry-specific templates that work out of the box
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-center">
                <CardContent className="pt-6">
                  <Rocket className="w-12 h-12 text-purple-500 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Quick Launch</h3>
                  <p className="text-sm text-muted-foreground">
                    Get up and running in under 30 minutes
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Estimated setup time: 15-30 minutes</span>
            </div>
          </div>
        );

      case 'restaurant-info':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Tell us about your restaurant</h2>
              <p className="text-muted-foreground">
                This information helps us customize the platform for your specific needs.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="restaurant-name">Restaurant Name</Label>
                  <Input
                    id="restaurant-name"
                    value={config.restaurantInfo.name}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      restaurantInfo: { ...prev.restaurantInfo, name: e.target.value }
                    }))}
                    placeholder="Enter your restaurant name"
                  />
                </div>
                
                <div>
                  <Label>Restaurant Type</Label>
                  <RadioGroup
                    value={config.restaurantInfo.type}
                    onValueChange={(value) => setConfig(prev => ({
                      ...prev,
                      restaurantInfo: { ...prev.restaurantInfo, type: value as any }
                    }))}
                    className="grid grid-cols-1 gap-3 mt-2"
                  >
                    {RESTAURANT_TYPES.map((type) => (
                      <div key={type.id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted transition-colors">
                        <RadioGroupItem value={type.id} id={type.id} />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-lg">{type.icon}</span>
                            <Label htmlFor={type.id} className="font-medium">{type.name}</Label>
                          </div>
                          <p className="text-sm text-muted-foreground">{type.description}</p>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label>Restaurant Size</Label>
                  <Select 
                    value={config.restaurantInfo.size} 
                    onValueChange={(value) => setConfig(prev => ({
                      ...prev,
                      restaurantInfo: { ...prev.restaurantInfo, size: value as any }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small (1-3 locations)</SelectItem>
                      <SelectItem value="medium">Medium (4-10 locations)</SelectItem>
                      <SelectItem value="large">Large (11-50 locations)</SelectItem>
                      <SelectItem value="enterprise">Enterprise (50+ locations)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="locations">Number of Locations</Label>
                  <Input
                    id="locations"
                    type="number"
                    min={1}
                    value={config.restaurantInfo.locations}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      restaurantInfo: { ...prev.restaurantInfo, locations: parseInt(e.target.value) || 1 }
                    }))}
                  />
                </div>
                
                <div>
                  <Label>Region</Label>
                  <Select 
                    value={config.restaurantInfo.region} 
                    onValueChange={(value) => setConfig(prev => ({
                      ...prev,
                      restaurantInfo: { ...prev.restaurantInfo, region: value as any }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="us">United States</SelectItem>
                      <SelectItem value="ca">Canada</SelectItem>
                      <SelectItem value="eu">Europe</SelectItem>
                      <SelectItem value="uk">United Kingdom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={config.restaurantInfo.address.city}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      restaurantInfo: {
                        ...prev.restaurantInfo,
                        address: { ...prev.restaurantInfo.address, city: e.target.value }
                      }
                    }))}
                    placeholder="Enter your city"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'template-selection':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Choose your template</h2>
              <p className="text-muted-foreground">
                We've pre-selected the best template for your restaurant type. You can customize it later.
              </p>
            </div>
            
            {recommendedTemplate && (
              <Card className="max-w-2xl mx-auto border-2 border-blue-200 bg-blue-50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{recommendedTemplate.icon}</span>
                      <div>
                        <CardTitle className="flex items-center">
                          {recommendedTemplate.name}
                          <Badge className="ml-2">Recommended</Badge>
                        </CardTitle>
                        <CardDescription>{recommendedTemplate.description}</CardDescription>
                      </div>
                    </div>
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Included Features:</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {recommendedTemplate.workflows.slice(0, 4).map((workflow) => (
                          <div key={workflow.id} className="flex items-center space-x-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm">{workflow.name}</span>
                          </div>
                        ))}
                        {recommendedTemplate.workflows.length > 4 && (
                          <div className="text-sm text-muted-foreground">
                            +{recommendedTemplate.workflows.length - 4} more workflows
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Integrations:</h4>
                      <div className="flex flex-wrap gap-2">
                        {recommendedTemplate.integrations.map((integration) => (
                          <Badge key={integration.type} variant="secondary">
                            {integration.type.replace('_', ' ').toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <div className="max-w-2xl mx-auto">
              <h3 className="font-semibold mb-4">Other Available Templates:</h3>
              <div className="grid gap-4">
                {restaurantTemplates
                  .filter(t => t.id !== recommendedTemplate?.id)
                  .slice(0, 3)
                  .map((template) => (
                    <Card 
                      key={template.id} 
                      className={`cursor-pointer transition-colors hover:bg-muted ${
                        config.selectedTemplate === template.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                      onClick={() => setConfig(prev => ({ ...prev, selectedTemplate: template.id }))}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="text-xl">{template.icon}</span>
                            <div>
                              <h4 className="font-medium">{template.name}</h4>
                              <p className="text-sm text-muted-foreground">{template.description}</p>
                            </div>
                          </div>
                          {config.selectedTemplate === template.id && (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                }
              </div>
            </div>
          </div>
        );

      case 'integrations':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Connect your tools</h2>
              <p className="text-muted-foreground">
                Select the systems you currently use. We'll set up automatic data synchronization.
              </p>
            </div>
            
            <div className="max-w-4xl mx-auto space-y-6">
              {Object.entries(INTEGRATION_PROVIDERS).map(([category, providers]) => (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="capitalize">{category.replace('_', ' ')} System</CardTitle>
                    <CardDescription>
                      Choose your {category} provider for automatic integration
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id={`enable-${category}`}
                          checked={config.integrations[category as keyof IntegrationSelection].enabled}
                          onCheckedChange={(checked) => setConfig(prev => ({
                            ...prev,
                            integrations: {
                              ...prev.integrations,
                              [category]: {
                                ...prev.integrations[category as keyof IntegrationSelection],
                                enabled: checked as boolean
                              }
                            }
                          }))}
                        />
                        <Label htmlFor={`enable-${category}`} className="font-medium">
                          Enable {category} integration
                        </Label>
                      </div>
                      
                      {config.integrations[category as keyof IntegrationSelection].enabled && (
                        <RadioGroup
                          value={config.integrations[category as keyof IntegrationSelection].provider}
                          onValueChange={(value) => setConfig(prev => ({
                            ...prev,
                            integrations: {
                              ...prev.integrations,
                              [category]: {
                                ...prev.integrations[category as keyof IntegrationSelection],
                                provider: value
                              }
                            }
                          }))}
                          className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6"
                        >
                          {providers.map((provider) => (
                            <div key={provider.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                              <RadioGroupItem value={provider.id} id={`${category}-${provider.id}`} />
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <span>{provider.logo}</span>
                                  <Label htmlFor={`${category}-${provider.id}`} className="font-medium">
                                    {provider.name}
                                  </Label>
                                </div>
                                <p className="text-sm text-muted-foreground">{provider.description}</p>
                              </div>
                            </div>
                          ))}
                        </RadioGroup>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case 'features':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Select platform features</h2>
              <p className="text-muted-foreground">
                Choose the features you want to enable. You can always add more later.
              </p>
            </div>
            
            <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  key: 'analytics',
                  name: 'Analytics Dashboard',
                  description: 'Real-time business intelligence and reporting',
                  icon: '📊',
                  recommended: true,
                },
                {
                  key: 'alerts',
                  name: 'Smart Alerts',
                  description: 'Proactive notifications for important events',
                  icon: '🔔',
                  recommended: true,
                },
                {
                  key: 'reporting',
                  name: 'Automated Reporting',
                  description: 'Scheduled reports delivered to your inbox',
                  icon: '📈',
                  recommended: true,
                },
                {
                  key: 'benchmarking',
                  name: 'Industry Benchmarking',
                  description: 'Compare your performance against industry standards',
                  icon: '🎯',
                  recommended: true,
                },
                {
                  key: 'automation',
                  name: 'Workflow Automation',
                  description: 'Automate repetitive tasks and processes',
                  icon: '🤖',
                  recommended: false,
                },
                {
                  key: 'cdp',
                  name: 'Customer Data Platform',
                  description: 'Unified customer profiles and segmentation',
                  icon: '👥',
                  recommended: false,
                },
                {
                  key: 'reverseEtl',
                  name: 'Reverse ETL',
                  description: 'Sync data back to operational systems',
                  icon: '🔄',
                  recommended: false,
                },
                {
                  key: 'forecasting',
                  name: 'AI Forecasting',
                  description: 'Predictive analytics for sales and demand',
                  icon: '🔮',
                  recommended: false,
                },
              ].map((feature) => (
                <Card 
                  key={feature.key} 
                  className={`cursor-pointer transition-colors ${
                    config.features[feature.key as keyof FeatureSelection] 
                      ? 'ring-2 ring-blue-500 bg-blue-50' 
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setConfig(prev => ({
                    ...prev,
                    features: {
                      ...prev.features,
                      [feature.key]: !prev.features[feature.key as keyof FeatureSelection]
                    }
                  }))}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <span className="text-2xl">{feature.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium">{feature.name}</h4>
                            {feature.recommended && (
                              <Badge variant="secondary" className="text-xs">Recommended</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
                        </div>
                      </div>
                      {config.features[feature.key as keyof FeatureSelection] && (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case 'configuration':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Configuration summary</h2>
              <p className="text-muted-foreground">
                Review your configuration before we set everything up.
              </p>
            </div>
            
            <div className="max-w-3xl mx-auto space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Restaurant Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-muted-foreground">Name:</span>
                      <p className="font-medium">{config.restaurantInfo.name}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Type:</span>
                      <p className="font-medium capitalize">
                        {RESTAURANT_TYPES.find(t => t.id === config.restaurantInfo.type)?.name}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Size:</span>
                      <p className="font-medium capitalize">{config.restaurantInfo.size}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Locations:</span>
                      <p className="font-medium">{config.restaurantInfo.locations}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Selected Template</CardTitle>
                </CardHeader>
                <CardContent>
                  {recommendedTemplate && (
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{recommendedTemplate.icon}</span>
                      <div>
                        <h4 className="font-medium">{recommendedTemplate.name}</h4>
                        <p className="text-sm text-muted-foreground">{recommendedTemplate.description}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Enabled Integrations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(config.integrations)
                      .filter(([_, integration]) => integration.enabled)
                      .map(([category, integration]) => (
                        <div key={category} className="flex items-center justify-between">
                          <span className="capitalize">{category.replace('_', ' ')}</span>
                          <Badge variant="outline">{integration.provider}</Badge>
                        </div>
                      ))
                    }
                    {Object.values(config.integrations).every(int => !int.enabled) && (
                      <p className="text-sm text-muted-foreground">No integrations selected</p>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Enabled Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(config.features)
                      .filter(([_, enabled]) => enabled)
                      .map(([feature, _]) => (
                        <div key={feature} className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="capitalize">{feature.replace(/([A-Z])/g, ' $1').trim()}</span>
                        </div>
                      ))
                    }
                  </div>
                </CardContent>
              </Card>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">
                    Estimated setup time: {estimatedSetupTime} minutes
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'review':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Ready to launch!</h2>
              <p className="text-muted-foreground">
                We're ready to set up your restaurant intelligence platform.
              </p>
            </div>
            
            <div className="max-w-2xl mx-auto text-center space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-green-900 mb-2">
                  Configuration Complete
                </h3>
                <p className="text-green-700">
                  Your platform will be configured with smart defaults optimized for your restaurant type and size.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Settings className="w-6 h-6 text-blue-600" />
                  </div>
                  <h4 className="font-medium">Smart Defaults</h4>
                  <p className="text-sm text-muted-foreground">Optimized settings for your restaurant</p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Zap className="w-6 h-6 text-green-600" />
                  </div>
                  <h4 className="font-medium">Instant Setup</h4>
                  <p className="text-sm text-muted-foreground">Ready to use in minutes</p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                    <Shield className="w-6 h-6 text-purple-600" />
                  </div>
                  <h4 className="font-medium">Secure & Compliant</h4>
                  <p className="text-sm text-muted-foreground">Enterprise-grade security</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'completion':
        return (
          <div className="text-center space-y-6">
            {loading ? (
              <>
                <div className="space-y-4">
                  <Loader2 className="w-16 h-16 text-blue-500 mx-auto animate-spin" />
                  <h2 className="text-2xl font-bold">Setting up your platform...</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    We're configuring your restaurant intelligence platform with the selected features and integrations.
                  </p>
                </div>
                
                <div className="max-w-md mx-auto space-y-3">
                  {[
                    'Applying smart defaults...',
                    'Configuring integrations...',
                    'Setting up dashboards...',
                    'Initializing analytics...',
                    'Finalizing setup...',
                  ].map((step, index) => (
                    <div key={step} className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${
                        index < 3 ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                      <span className={`text-sm ${
                        index < 3 ? 'text-gray-900' : 'text-gray-500'
                      }`}>{step}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                  <h2 className="text-2xl font-bold">Welcome to your Restaurant Intelligence Platform!</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Your platform is now ready. Start exploring your dashboard and analytics.
                  </p>
                </div>
                
                <Button size="lg" onClick={() => window.location.href = '/dashboard'}>
                  <Rocket className="w-4 h-4 mr-2" />
                  Go to Dashboard
                </Button>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Setup Wizard</h1>
            <div className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {ONBOARDING_STEPS.length}
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        {/* Step Content */}
        <Card className="mb-8">
          <CardContent className="p-8">
            {renderStep()}
          </CardContent>
        </Card>
        
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStepIndex === 0 || loading}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          <div className="flex space-x-2">
            {currentStep === 'review' ? (
              <Button onClick={handleComplete} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4 mr-2" />
                )}
                {loading ? 'Setting up...' : 'Complete Setup'}
              </Button>
            ) : currentStep === 'completion' ? null : (
              <Button
                onClick={handleNext}
                disabled={loading || (
                  currentStep === 'restaurant-info' && !config.restaurantInfo.name
                )}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}