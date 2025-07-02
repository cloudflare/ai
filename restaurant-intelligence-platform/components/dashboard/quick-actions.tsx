'use client';

import { 
  RefreshCw, 
  FileText, 
  AlertTriangle, 
  Download,
  Play,
  Settings
} from 'lucide-react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { 
  syncToastData, 
  syncOpenTableData, 
  sync7ShiftsData,
  generateInsights 
} from '@/app/actions';

export function QuickActions() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const actions = [
    {
      icon: RefreshCw,
      label: 'Sync All Data',
      color: 'bg-blue-600 hover:bg-blue-700',
      action: async () => {
        startTransition(async () => {
          await Promise.all([
            syncToastData(),
            syncOpenTableData(),
            sync7ShiftsData(),
          ]);
          router.refresh();
        });
      },
    },
    {
      icon: FileText,
      label: 'Generate Report',
      color: 'bg-green-600 hover:bg-green-700',
      action: () => {
        router.push('/reports/new');
      },
    },
    {
      icon: AlertTriangle,
      label: 'Review Alerts',
      color: 'bg-orange-600 hover:bg-orange-700',
      action: () => {
        router.push('/alerts');
      },
    },
    {
      icon: Download,
      label: 'Export Data',
      color: 'bg-purple-600 hover:bg-purple-700',
      action: () => {
        router.push('/export');
      },
    },
    {
      icon: Play,
      label: 'Run Workflow',
      color: 'bg-indigo-600 hover:bg-indigo-700',
      action: () => {
        router.push('/workflows');
      },
    },
    {
      icon: Settings,
      label: 'Settings',
      color: 'bg-gray-600 hover:bg-gray-700',
      action: () => {
        router.push('/settings');
      },
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
      
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={index}
              onClick={action.action}
              disabled={isPending}
              className={`${action.color} text-white rounded-lg p-4 flex flex-col items-center justify-center space-y-2 transition-colors disabled:opacity-50`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          );
        })}
      </div>

      {isPending && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">Processing...</p>
        </div>
      )}
    </div>
  );
}