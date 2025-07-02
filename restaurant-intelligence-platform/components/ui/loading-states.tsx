'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className,
  variant = 'text',
  animation = 'pulse',
}: SkeletonProps) {
  const variantClasses = {
    text: 'h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-md',
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: '',
  };

  return (
    <div
      className={cn(
        'bg-gray-200 dark:bg-gray-800',
        variantClasses[variant],
        animationClasses[animation],
        className
      )}
      aria-hidden="true"
    />
  );
}

interface CardSkeletonProps {
  showAvatar?: boolean;
  lines?: number;
}

export function CardSkeleton({ showAvatar = true, lines = 3 }: CardSkeletonProps) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-6 space-y-4">
      {showAvatar && (
        <div className="flex items-center space-x-4">
          <Skeleton variant="circular" className="h-12 w-12" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-4', i === lines - 1 && 'w-4/5')}
          />
        ))}
      </div>
    </div>
  );
}

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  showHeader = true,
}: TableSkeletonProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      {showHeader && (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-6 py-3">
          <div className="flex space-x-4">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
        </div>
      )}
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-6 py-4">
            <div className="flex space-x-4">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <Skeleton
                  key={colIndex}
                  className={cn(
                    'h-4 flex-1',
                    colIndex === 0 && 'max-w-[200px]'
                  )}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-gray-700" />
      <div className="absolute inset-0 rounded-full border-2 border-t-blue-600 dark:border-t-blue-400 animate-spin" />
    </div>
  );
}

interface LoadingOverlayProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingOverlay({ message, fullScreen = false }: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50',
        fullScreen ? 'fixed inset-0' : 'absolute inset-0 rounded-lg'
      )}
    >
      <div className="text-center space-y-4">
        <LoadingSpinner size="lg" />
        {message && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        )}
      </div>
    </div>
  );
}

interface PageLoadingProps {
  title?: string;
  description?: string;
}

export function PageLoading({ title, description }: PageLoadingProps) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <LoadingSpinner size="lg" className="mx-auto" />
        {title && (
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
        )}
        {description && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}