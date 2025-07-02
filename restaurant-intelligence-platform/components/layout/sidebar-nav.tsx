'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface SidebarNavItem {
  name: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string | number;
  children?: SidebarNavItem[];
}

interface SidebarNavProps {
  navigation: SidebarNavItem[];
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function SidebarNav({
  navigation,
  collapsed = false,
  onCollapsedChange,
}: SidebarNavProps) {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (name: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedItems(newExpanded);
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === href;
    return pathname.startsWith(href);
  };

  const renderNavItem = (item: SidebarNavItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.name);

    return (
      <div key={item.name}>
        <div className="relative">
          <Link
            href={item.href}
            onClick={(e) => {
              if (hasChildren && !collapsed) {
                e.preventDefault();
                toggleExpanded(item.name);
              }
            }}
            className={cn(
              'flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              isActive(item.href)
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-300',
              depth > 0 && 'ml-4'
            )}
          >
            {item.icon && (
              <div
                className={cn(
                  'flex-shrink-0 transition-all duration-200',
                  collapsed ? 'mr-0' : 'mr-3'
                )}
              >
                {item.icon}
              </div>
            )}
            
            {!collapsed && (
              <>
                <span className="flex-1 text-left">{item.name}</span>
                
                {item.badge && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
                    {item.badge}
                  </span>
                )}
                
                {hasChildren && (
                  <svg
                    className={cn(
                      'w-4 h-4 ml-2 transition-transform duration-200',
                      isExpanded && 'rotate-90'
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                )}
              </>
            )}
          </Link>

          {/* Tooltip for collapsed state */}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 text-sm bg-gray-900 dark:bg-gray-700 text-white rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
              {item.name}
              {item.badge && (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500 rounded">
                  {item.badge}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Children items */}
        {hasChildren && isExpanded && !collapsed && (
          <div className="mt-1 space-y-1">
            {item.children!.map((child) => renderNavItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          {!collapsed && (
            <Link href="/" className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">R</span>
              </div>
              <span className="font-semibold text-lg text-gray-900 dark:text-white">
                Restaurant
              </span>
            </Link>
          )}
          
          <button
            onClick={() => onCollapsedChange?.(!collapsed)}
            className={cn(
              'p-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
              collapsed && 'mx-auto'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {collapsed ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <div key={item.name} className="group">
            {renderNavItem(item)}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-800">
        <button
          className={cn(
            'flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors',
            'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
          )}
        >
          <svg
            className={cn(
              'w-5 h-5 flex-shrink-0',
              !collapsed && 'mr-3'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}