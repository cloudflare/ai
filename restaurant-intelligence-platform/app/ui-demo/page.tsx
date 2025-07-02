'use client';

import { useState } from 'react';
import { ResponsiveContainer } from '@/components/ui/responsive-container';
import { 
  Skeleton, 
  CardSkeleton, 
  TableSkeleton, 
  LoadingSpinner, 
  LoadingOverlay,
  PageLoading 
} from '@/components/ui/loading-states';
import {
  EmptyState,
  NoResults,
  ErrorState,
  ComingSoon
} from '@/components/ui/empty-states';

export default function UIDemoPage() {
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [searchTerm, setSearchTerm] = useState('restaurant analytics');

  return (
    <ResponsiveContainer maxWidth="7xl" className="py-8">
      <div className="space-y-12">
        {/* Page Header */}
        <div className="animate-fade-in-down">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            UI Components Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Explore the enhanced navigation and UI/UX components
          </p>
        </div>

        {/* Loading States Section */}
        <section className="space-y-6 animate-fade-in-up">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Loading States
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Skeleton Examples */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
                Text Skeleton
              </h3>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
                Circular Skeleton
              </h3>
              <div className="flex space-x-4">
                <Skeleton variant="circular" className="h-12 w-12" />
                <Skeleton variant="circular" className="h-16 w-16" />
                <Skeleton variant="circular" className="h-20 w-20" />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
                Loading Spinner
              </h3>
              <div className="flex space-x-4 items-center">
                <LoadingSpinner size="sm" />
                <LoadingSpinner size="md" />
                <LoadingSpinner size="lg" />
              </div>
            </div>
          </div>

          {/* Card Skeleton */}
          <div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
              Card Skeleton
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CardSkeleton />
              <CardSkeleton showAvatar={false} lines={4} />
            </div>
          </div>

          {/* Table Skeleton */}
          <div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
              Table Skeleton
            </h3>
            <TableSkeleton rows={3} columns={5} />
          </div>

          {/* Loading Overlay Demo */}
          <div>
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
              Loading Overlay
            </h3>
            <div className="relative h-64 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <button
                onClick={() => {
                  setShowLoadingOverlay(true);
                  setTimeout(() => setShowLoadingOverlay(false), 3000);
                }}
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Show Loading Overlay
              </button>
              {showLoadingOverlay && (
                <LoadingOverlay message="Processing your request..." />
              )}
            </div>
          </div>
        </section>

        {/* Empty States Section */}
        <section className="space-y-6 animate-fade-in-up">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Empty States
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Empty State */}
            <div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
                Default Empty State
              </h3>
              <EmptyState
                icon={
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                }
                title="No data available"
                description="Start by adding your first restaurant location to see analytics"
                action={
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                    Add Location
                  </button>
                }
              />
            </div>

            {/* Card Empty State */}
            <div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
                Card Empty State
              </h3>
              <EmptyState
                variant="card"
                icon={
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                }
                title="No reports yet"
                description="Generate your first report to see insights"
              />
            </div>

            {/* No Results */}
            <div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
                No Search Results
              </h3>
              <NoResults
                searchTerm={searchTerm}
                suggestions={['sales data', 'inventory', 'customer analytics']}
                onSuggestionClick={(suggestion) => setSearchTerm(suggestion)}
              />
            </div>

            {/* Error State */}
            <div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
                Error State
              </h3>
              <ErrorState
                title="Failed to load data"
                error="Unable to connect to the database. Please check your connection and try again."
                onRetry={() => alert('Retrying...')}
              />
            </div>

            {/* Coming Soon */}
            <div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
                Coming Soon
              </h3>
              <ComingSoon
                feature="AI-Powered Forecasting"
                description="Advanced predictive analytics to help you make better business decisions"
                notifyMe={() => alert('You will be notified!')}
              />
            </div>

            {/* Minimal Empty State */}
            <div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-4">
                Minimal Empty State
              </h3>
              <EmptyState
                variant="minimal"
                title="No notifications"
                description="You're all caught up!"
              />
            </div>
          </div>
        </section>

        {/* Page Loading */}
        <section className="space-y-6 animate-fade-in-up">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Page Loading State
          </h2>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-8">
            <PageLoading
              title="Loading Analytics"
              description="Fetching your restaurant data..."
            />
          </div>
        </section>

        {/* Responsive Behavior */}
        <section className="space-y-6 animate-fade-in-up">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Responsive Behavior
          </h2>
          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Resize your browser window to see the responsive navigation in action:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>Mobile menu appears below 768px width</li>
              <li>Navigation hides on scroll down on mobile</li>
              <li>Smooth animations and transitions throughout</li>
              <li>Touch-friendly targets and interactions</li>
              <li>Accessible keyboard navigation</li>
            </ul>
          </div>
        </section>
      </div>
    </ResponsiveContainer>
  );
}