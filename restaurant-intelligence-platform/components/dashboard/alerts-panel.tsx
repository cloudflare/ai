'use client';

import { Alert } from '@/lib/types';
import { AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { updateAlertStatus } from '@/app/actions';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface AlertsPanelProps {
  alerts: Alert[];
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleAcknowledge = (alertId: string) => {
    startTransition(async () => {
      await updateAlertStatus(alertId, 'acknowledged');
      router.refresh();
    });
  };

  const handleResolve = (alertId: string) => {
    startTransition(async () => {
      await updateAlertStatus(alertId, 'resolved');
      router.refresh();
    });
  };

  const getAlertIcon = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'high':
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      case 'medium':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical':
        return 'border-red-200 bg-red-50';
      case 'high':
        return 'border-orange-200 bg-orange-50';
      case 'medium':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-blue-200 bg-blue-50';
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <p className="text-gray-500">No active alerts</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.map((alert, index) => (
        <motion.div
          key={alert.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`bg-white rounded-lg shadow-sm border-2 p-4 ${getSeverityColor(alert.severity)}`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {getAlertIcon(alert.severity)}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{alert.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
              
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-gray-500">
                  <span>{alert.source}</span>
                  <span className="mx-2">•</span>
                  <span>{new Date(alert.createdAt).toLocaleString()}</span>
                </div>
                
                <div className="flex space-x-2">
                  {alert.status === 'active' && (
                    <>
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={isPending}
                        className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => handleResolve(alert.id)}
                        disabled={isPending}
                        className="text-xs px-3 py-1 bg-green-100 hover:bg-green-200 rounded-md text-green-700 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    </>
                  )}
                  {alert.status === 'acknowledged' && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      disabled={isPending}
                      className="text-xs px-3 py-1 bg-green-100 hover:bg-green-200 rounded-md text-green-700 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}