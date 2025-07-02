'use client';

import { Metric } from '@/lib/types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardMetricsProps {
  metrics: Metric[];
}

export function DashboardMetrics({ metrics }: DashboardMetricsProps) {
  // Group metrics by type for better organization
  const groupedMetrics = metrics.reduce((acc, metric) => {
    const type = metric.metricType;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(metric);
    return acc;
  }, {} as Record<string, Metric[]>);

  // Get the latest value for each metric type
  const latestMetrics = Object.entries(groupedMetrics).map(([type, metrics]) => {
    const sorted = metrics.sort((a, b) => 
      new Date(b.period.end).getTime() - new Date(a.period.end).getTime()
    );
    const current = sorted[0];
    const previous = sorted[1];
    
    let trend = 0;
    if (current && previous) {
      trend = ((current.value - previous.value) / previous.value) * 100;
    }
    
    return {
      ...current,
      trend,
      hasPrevious: !!previous,
    };
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {latestMetrics.map((metric, index) => (
        <motion.div
          key={metric.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-gray-600 capitalize">
                {metric.metricType.replace(/_/g, ' ')}
              </p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatMetricValue(metric.value, metric.unit)}
              </p>
              
              {metric.hasPrevious && (
                <div className="flex items-center mt-2">
                  {metric.trend > 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  ) : metric.trend < 0 ? (
                    <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                  ) : (
                    <Minus className="w-4 h-4 text-gray-400 mr-1" />
                  )}
                  <span 
                    className={`text-sm font-medium ${
                      metric.trend > 0 
                        ? 'text-green-600' 
                        : metric.trend < 0 
                        ? 'text-red-600' 
                        : 'text-gray-500'
                    }`}
                  >
                    {Math.abs(metric.trend).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            
            {metric.dimensions && (
              <div className="text-xs text-gray-500 text-right">
                {Object.entries(metric.dimensions).map(([key, value]) => (
                  <div key={key}>
                    {key}: {value}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function formatMetricValue(value: number, unit?: string): string {
  if (unit === 'currency' || unit === 'USD') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  if (unit === 'percentage' || unit === '%') {
    return `${value.toFixed(1)}%`;
  }
  
  if (unit === 'time' || unit === 'minutes') {
    return `${value.toFixed(0)}m`;
  }
  
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  
  return value.toLocaleString();
}