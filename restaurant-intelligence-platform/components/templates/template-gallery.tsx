'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { RestaurantTemplate, restaurantTemplates, applyTemplate } from '@/lib/templates/restaurant-templates';
import { WorkflowTemplate, workflowTemplates, instantiateWorkflow } from '@/lib/templates/workflow-templates';
import {
  Search,
  Filter,
  Star,
  Clock,
  Users,
  TrendingUp,
  Settings,
  Play,
  Eye,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  Tag,
  Zap,
} from 'lucide-react';

interface TemplateGalleryProps {
  onTemplateSelect?: (template: RestaurantTemplate | WorkflowTemplate) => void;
  onTemplateApply?: (templateId: string, config: any) => void;
  showPreview?: boolean;
  organizationId?: string;
}

interface TemplateFilters {
  category: string;
  difficulty: string;
  tags: string[];
  estimatedTime: string;
}

export function TemplateGallery({
  onTemplateSelect,
  onTemplateApply,
  showPreview = true,
  organizationId,
}: TemplateGalleryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<TemplateFilters>({
    category: 'all',
    difficulty: 'all',
    tags: [],
    estimatedTime: 'all',
  });
  const [selectedTemplate, setSelectedTemplate] = useState<RestaurantTemplate | WorkflowTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<'restaurant' | 'workflow'>('restaurant');
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);
  const [appliedTemplates, setAppliedTemplates] = useState<Set<string>>(new Set());

  // Filter and search logic
  const filteredRestaurantTemplates = useMemo(() => {
    return restaurantTemplates.filter(template => {
      const matchesSearch = 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = filters.category === 'all' || template.category === filters.category;
      const matchesTags = filters.tags.length === 0 || filters.tags.every(tag => 
        template.tags?.includes(tag)
      );
      
      return matchesSearch && matchesCategory && matchesTags;
    });
  }, [searchQuery, filters]);

  const filteredWorkflowTemplates = useMemo(() => {
    return workflowTemplates.filter(template => {
      const matchesSearch = 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = filters.category === 'all' || template.category === filters.category;
      const matchesDifficulty = filters.difficulty === 'all' || template.difficulty === filters.difficulty;
      const matchesTags = filters.tags.length === 0 || filters.tags.every(tag => 
        template.tags.includes(tag)
      );
      const matchesTime = filters.estimatedTime === 'all' || 
        (filters.estimatedTime === 'quick' && template.estimatedSetupTime <= 30) ||
        (filters.estimatedTime === 'medium' && template.estimatedSetupTime > 30 && template.estimatedSetupTime <= 60) ||
        (filters.estimatedTime === 'long' && template.estimatedSetupTime > 60);
      
      return matchesSearch && matchesCategory && matchesDifficulty && matchesTags && matchesTime;
    });
  }, [searchQuery, filters]);

  const handleApplyTemplate = async (template: RestaurantTemplate | WorkflowTemplate) => {
    if (!organizationId) return;
    
    setApplyingTemplate(template.id);
    
    try {
      if ('workflows' in template) {
        // Restaurant template
        const result = await applyTemplate(template.id, {
          organizationId,
        });
        
        if (result.success) {
          setAppliedTemplates(prev => new Set([...prev, template.id]));
          onTemplateApply?.(template.id, result);
        }
      } else {
        // Workflow template
        const result = await instantiateWorkflow(template.id, {
          name: `${template.name} - ${new Date().toLocaleDateString()}`,
        });
        
        if (result.success) {
          setAppliedTemplates(prev => new Set([...prev, template.id]));
          onTemplateApply?.(template.id, result);
        }
      }
    } catch (error) {
      console.error('Failed to apply template:', error);
    } finally {
      setApplyingTemplate(null);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'operations': return <Settings className="w-4 h-4" />;
      case 'marketing': return <TrendingUp className="w-4 h-4" />;
      case 'analytics': return <TrendingUp className="w-4 h-4" />;
      case 'customer': return <Users className="w-4 h-4" />;
      case 'financial': return <TrendingUp className="w-4 h-4" />;
      case 'data_processing': return <Settings className="w-4 h-4" />;
      case 'automation': return <Zap className="w-4 h-4" />;
      default: return <Tag className="w-4 h-4" />;
    }
  };

  const TemplateCard = ({ template, type }: { template: RestaurantTemplate | WorkflowTemplate; type: 'restaurant' | 'workflow' }) => {
    const isApplied = appliedTemplates.has(template.id);
    const isApplying = applyingTemplate === template.id;
    
    return (
      <Card className="group hover:shadow-lg transition-all duration-200 border-2 hover:border-blue-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">{template.icon}</span>
              <div>
                <CardTitle className="text-lg group-hover:text-blue-600 transition-colors">
                  {template.name}
                </CardTitle>
                <div className="flex items-center space-x-2 mt-1">
                  {getCategoryIcon(template.category)}
                  <span className="text-sm text-muted-foreground capitalize">
                    {template.category.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
            {isApplied && (
              <CheckCircle className="w-5 h-5 text-green-500" />
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <CardDescription className="text-sm leading-relaxed">
            {template.description}
          </CardDescription>
          
          <div className="flex flex-wrap gap-2">
            {template.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {template.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{template.tags.length - 3} more
              </Badge>
            )}
          </div>
          
          {type === 'workflow' && 'difficulty' in template && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{template.estimatedSetupTime} min</span>
              </div>
              <Badge className={getDifficultyColor(template.difficulty)}>
                {template.difficulty}
              </Badge>
            </div>
          )}
          
          <div className="flex space-x-2 pt-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => setSelectedTemplate(template)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </Button>
              </DialogTrigger>
              <TemplatePreviewDialog template={template} type={type} />
            </Dialog>
            
            <Button 
              size="sm" 
              className="flex-1"
              onClick={() => handleApplyTemplate(template)}
              disabled={isApplying || isApplied}
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : isApplied ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Applied
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Apply
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const TemplatePreviewDialog = ({ template, type }: { template: RestaurantTemplate | WorkflowTemplate; type: 'restaurant' | 'workflow' }) => (
    <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
      <DialogHeader>
        <DialogTitle className="flex items-center space-x-2">
          <span className="text-2xl">{template.icon}</span>
          <span>{template.name}</span>
        </DialogTitle>
        <DialogDescription>{template.description}</DialogDescription>
      </DialogHeader>
      
      <ScrollArea className="max-h-[60vh]">
        <div className="space-y-6 pr-4">
          {/* Template Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Category</h4>
              <div className="flex items-center space-x-2">
                {getCategoryIcon(template.category)}
                <span className="capitalize">{template.category.replace('_', ' ')}</span>
              </div>
            </div>
            
            {type === 'workflow' && 'difficulty' in template && (
              <div>
                <h4 className="font-semibold mb-2">Difficulty</h4>
                <Badge className={getDifficultyColor(template.difficulty)}>
                  {template.difficulty}
                </Badge>
              </div>
            )}
          </div>
          
          {/* Tags */}
          <div>
            <h4 className="font-semibold mb-2">Tags</h4>
            <div className="flex flex-wrap gap-2">
              {template.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          
          {/* Restaurant Template Specific */}
          {type === 'restaurant' && 'workflows' in template && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold mb-3">Included Workflows</h4>
                <div className="space-y-2">
                  {template.workflows.map((workflow) => (
                    <div key={workflow.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <h5 className="font-medium">{workflow.name}</h5>
                        <p className="text-sm text-muted-foreground">
                          {workflow.steps.length} steps • {workflow.trigger} trigger
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Integrations</h4>
                <div className="grid grid-cols-2 gap-2">
                  {template.integrations.map((integration) => (
                    <div key={integration.type} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="capitalize">{integration.type.replace('_', ' ')}</span>
                      <Badge variant={integration.enabled ? 'default' : 'secondary'}>
                        {integration.enabled ? 'Enabled' : 'Optional'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Alerts & Monitoring</h4>
                <div className="space-y-2">
                  {template.alerts.map((alert) => (
                    <div key={alert.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="font-medium">{alert.name}</h5>
                        <Badge variant="outline">{alert.condition} {alert.threshold}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Channels: {alert.channels.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          
          {/* Workflow Template Specific */}
          {type === 'workflow' && 'triggers' in template && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold mb-3">Triggers</h4>
                <div className="space-y-2">
                  {template.triggers.map((trigger) => (
                    <div key={trigger.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <h5 className="font-medium capitalize">{trigger.type.replace('_', ' ')}</h5>
                        <p className="text-sm text-muted-foreground">
                          {JSON.stringify(trigger.config)}
                        </p>
                      </div>
                      <Badge variant={trigger.enabled ? 'default' : 'secondary'}>
                        {trigger.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Actions</h4>
                <div className="space-y-2">
                  {template.actions.map((action, index) => (
                    <div key={action.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium">{action.name}</h5>
                        <Badge variant="outline">Step {index + 1}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Type: {action.type}
                      </p>
                      {action.dependsOn && action.dependsOn.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Depends on: {action.dependsOn.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Requirements</h4>
                <div className="space-y-2">
                  {template.requirements.map((req) => (
                    <div key={`${req.type}-${req.name}`} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span>{req.name}</span>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline">{req.type}</Badge>
                        {req.optional && <Badge variant="secondary">Optional</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </DialogContent>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Template Gallery</h2>
          <p className="text-muted-foreground">
            Pre-built templates to accelerate your restaurant intelligence setup
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
          
          <select
            value={filters.category}
            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Categories</option>
            <option value="operations">Operations</option>
            <option value="marketing">Marketing</option>
            <option value="analytics">Analytics</option>
            <option value="customer">Customer</option>
            <option value="automation">Automation</option>
          </select>
          
          <select
            value={filters.difficulty}
            onChange={(e) => setFilters(prev => ({ ...prev, difficulty: e.target.value }))}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="all">All Difficulties</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      {/* Template Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'restaurant' | 'workflow')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="restaurant" className="flex items-center space-x-2">
            <span>🏪</span>
            <span>Restaurant Templates</span>
          </TabsTrigger>
          <TabsTrigger value="workflow" className="flex items-center space-x-2">
            <span>⚡</span>
            <span>Workflow Templates</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="restaurant" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRestaurantTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                type="restaurant"
              />
            ))}
          </div>
          
          {filteredRestaurantTemplates.length === 0 && (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No templates found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filter criteria.</p>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="workflow" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWorkflowTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                type="workflow"
              />
            ))}
          </div>
          
          {filteredWorkflowTemplates.length === 0 && (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No templates found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filter criteria.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{restaurantTemplates.length}</div>
          <div className="text-sm text-muted-foreground">Restaurant Templates</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{workflowTemplates.length}</div>
          <div className="text-sm text-muted-foreground">Workflow Templates</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">{appliedTemplates.size}</div>
          <div className="text-sm text-muted-foreground">Applied</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">
            {Math.round((appliedTemplates.size / (restaurantTemplates.length + workflowTemplates.length)) * 100)}%
          </div>
          <div className="text-sm text-muted-foreground">Coverage</div>
        </div>
      </div>
    </div>
  );
}