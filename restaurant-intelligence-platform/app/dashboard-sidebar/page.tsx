import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { EmptyState } from '@/components/ui/empty-states';

export default function DashboardSidebarPage() {
  return (
    <ResponsiveContainer className="py-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Dashboard with Sidebar Navigation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            This layout demonstrates the collapsible sidebar navigation pattern
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Metric Cards */}
          {[
            { label: 'Total Revenue', value: '$45,231', change: '+12.5%', positive: true },
            { label: 'Active Locations', value: '5', change: '+1', positive: true },
            { label: 'Customer Satisfaction', value: '4.8/5', change: '+0.2', positive: true },
            { label: 'Inventory Alerts', value: '3', change: '-2', positive: false },
          ].map((metric, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
            >
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {metric.label}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {metric.value}
              </p>
              <p className={`text-sm mt-2 ${metric.positive ? 'text-green-600' : 'text-red-600'}`}>
                {metric.change} from last month
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Recent Activity
            </h2>
            <EmptyState
              variant="minimal"
              title="No recent activity"
              description="Your recent activities will appear here"
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'Generate Report', icon: '📊' },
                { name: 'Add Location', icon: '📍' },
                { name: 'View Analytics', icon: '📈' },
                { name: 'Manage Staff', icon: '👥' },
              ].map((action, index) => (
                <button
                  key={index}
                  className="p-4 text-center rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="text-2xl mb-2">{action.icon}</div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {action.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Tip: Try the sidebar controls
          </h3>
          <p className="text-blue-700 dark:text-blue-300">
            Click the collapse button in the sidebar to toggle between expanded and collapsed views.
            The sidebar is hidden on mobile devices to maximize screen space.
          </p>
        </div>
      </div>
    </ResponsiveContainer>
  );
}