'use client';

import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  variant?: 'default' | 'card' | 'minimal';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  variant = 'default',
}: EmptyStateProps) {
  if (variant === 'minimal') {
    return (
      <div className={cn('text-center py-8', className)}>
        {icon && (
          <div className="text-gray-400 dark:text-gray-600 mb-3">{icon}</div>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-400">{title}</p>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {description}
          </p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
  }

  const containerClasses = variant === 'card' 
    ? 'rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50'
    : '';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center',
        containerClasses,
        className
      )}
    >
      {icon && (
        <div className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {description && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

interface NoResultsProps {
  searchTerm?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}

export function NoResults({
  searchTerm,
  suggestions,
  onSuggestionClick,
}: NoResultsProps) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-full h-full"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
      }
      title={searchTerm ? `No results for "${searchTerm}"` : 'No results found'}
      description={
        suggestions && suggestions.length > 0
          ? 'Try searching for:'
          : 'Try adjusting your search criteria'
      }
      action={
        suggestions && suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : undefined
      }
    />
  );
}

interface ErrorStateProps {
  title?: string;
  error?: Error | string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
}: ErrorStateProps) {
  const errorMessage = error instanceof Error ? error.message : error;

  return (
    <EmptyState
      icon={
        <svg
          className="w-full h-full"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      }
      title={title}
      description={errorMessage}
      action={
        onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Try again
          </button>
        )
      }
      variant="card"
      className="text-red-600 dark:text-red-400"
    />
  );
}

interface ComingSoonProps {
  feature: string;
  description?: string;
  notifyMe?: () => void;
}

export function ComingSoon({ feature, description, notifyMe }: ComingSoonProps) {
  return (
    <EmptyState
      icon={
        <svg
          className="w-full h-full"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      }
      title={`${feature} - Coming Soon`}
      description={description || "We're working hard to bring you this feature. Stay tuned!"}
      action={
        notifyMe && (
          <button
            onClick={notifyMe}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Notify me when available
          </button>
        )
      }
      variant="card"
    />
  );
}