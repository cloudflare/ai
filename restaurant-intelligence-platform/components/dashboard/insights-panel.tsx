'use client';

import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  AlertCircle, 
  Lightbulb, 
  Target, 
  DollarSign,
  BarChart
} from 'lucide-react';

interface InsightResult {
  id: string;
  type: 'trend' | 'anomaly' | 'opportunity' | 'risk' | 'recommendation';
  title: string;
  description: string;
  impact: {
    metric: string;
    current: number;
    predicted: number;
    change: number;
    confidence: number;
  };
  recommendations: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

interface InsightsPanelProps {
  insights: InsightResult[];
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const getInsightIcon = (type: InsightResult['type']) => {
    switch (type) {
      case 'trend':
        return <TrendingUp className="w-5 h-5 text-blue-600" />;
      case 'anomaly':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'opportunity':
        return <DollarSign className="w-5 h-5 text-green-600" />;
      case 'risk':
        return <Target className="w-5 h-5 text-orange-600" />;
      case 'recommendation':
        return <Lightbulb className="w-5 h-5 text-purple-600" />;
      default:
        return <BarChart className="w-5 h-5 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: InsightResult['priority']) => {
    switch (priority) {
      case 'critical':
        return 'border-red-200 bg-red-50';
      case 'high':
        return 'border-orange-200 bg-orange-50';
      case 'medium':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  if (insights.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <p className="text-gray-500">No insights available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {insights.map((insight, index) => (
        <motion.div
          key={insight.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`bg-white rounded-lg shadow-sm border-2 p-4 ${getPriorityColor(insight.priority)}`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {getInsightIcon(insight.type)}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{insight.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
              
              {/* Impact Metrics */}
              <div className="mt-3 bg-white rounded-md p-3 border border-gray-200">
                <div className="text-xs text-gray-500 mb-1">
                  Impact on {insight.impact.metric}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium">
                      Current: {formatValue(insight.impact.current)}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="text-sm font-medium">
                      Predicted: {formatValue(insight.impact.predicted)}
                    </span>
                  </div>
                  <div className={`text-sm font-bold ${
                    insight.impact.change > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {insight.impact.change > 0 ? '+' : ''}{insight.impact.change.toFixed(1)}%
                  </div>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Confidence: {(insight.impact.confidence * 100).toFixed(0)}%
                </div>
              </div>
              
              {/* Recommendations */}
              {insight.recommendations.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-700 mb-1">
                    Recommended Actions:
                  </p>
                  <ul className="space-y-1">
                    {insight.recommendations.slice(0, 2).map((rec, idx) => (
                      <li key={idx} className="text-xs text-gray-600 flex items-start">
                        <span className="mr-1">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function formatValue(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(1);
}