'use client';

import { AnalyticsEvent } from '@/lib/types';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { useState, useEffect } from 'react';

interface RealtimeChartProps {
  events: AnalyticsEvent[];
}

export function RealtimeChart({ events }: RealtimeChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartType, setChartType] = useState<'line' | 'area'>('area');

  useEffect(() => {
    // Process events into time series data
    const processedData = processEventsToTimeSeries(events);
    setChartData(processedData);
  }, [events]);

  const processEventsToTimeSeries = (events: AnalyticsEvent[]) => {
    // Group events by hour
    const hourlyData = new Map<string, any>();
    
    events.forEach(event => {
      const hour = new Date(event.timestamp).toISOString().slice(0, 13) + ':00';
      
      if (!hourlyData.has(hour)) {
        hourlyData.set(hour, {
          time: hour,
          sales: 0,
          orders: 0,
          customers: 0,
        });
      }
      
      const data = hourlyData.get(hour);
      
      // Aggregate based on event category
      switch (event.category) {
        case 'sales':
          data.sales += event.data.amount || 0;
          break;
        case 'operations':
          data.orders += 1;
          break;
        case 'customer':
          data.customers += 1;
          break;
      }
    });
    
    // Convert to array and sort by time
    return Array.from(hourlyData.values())
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .slice(-24); // Last 24 hours
  };

  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric',
      hour12: true 
    });
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex space-x-4">
          <button
            onClick={() => setChartType('line')}
            className={`px-3 py-1 text-sm rounded-md ${
              chartType === 'line' 
                ? 'bg-gray-900 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setChartType('area')}
            className={`px-3 py-1 text-sm rounded-md ${
              chartType === 'area' 
                ? 'bg-gray-900 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Area
          </button>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                tickFormatter={formatXAxis}
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                yAxisId="left"
                tickFormatter={formatCurrency}
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                style={{ fontSize: '12px' }}
              />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleString()}
                formatter={(value: any, name: string) => {
                  if (name === 'sales') return formatCurrency(value);
                  return value;
                }}
              />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="sales"
                stroke="#8884d8"
                fillOpacity={1}
                fill="url(#colorSales)"
                name="Sales"
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="orders"
                stroke="#82ca9d"
                fillOpacity={1}
                fill="url(#colorOrders)"
                name="Orders"
              />
            </AreaChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="time" 
                tickFormatter={formatXAxis}
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                yAxisId="left"
                tickFormatter={formatCurrency}
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                yAxisId="right" 
                orientation="right"
                style={{ fontSize: '12px' }}
              />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleString()}
                formatter={(value: any, name: string) => {
                  if (name === 'sales') return formatCurrency(value);
                  return value;
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="sales"
                stroke="#8884d8"
                strokeWidth={2}
                dot={false}
                name="Sales"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="orders"
                stroke="#82ca9d"
                strokeWidth={2}
                dot={false}
                name="Orders"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="customers"
                stroke="#ffc658"
                strokeWidth={2}
                dot={false}
                name="Customers"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="text-center">
          <p className="text-xs text-gray-500">Total Sales</p>
          <p className="text-lg font-bold text-gray-900">
            {formatCurrency(chartData.reduce((sum, d) => sum + d.sales, 0))}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Total Orders</p>
          <p className="text-lg font-bold text-gray-900">
            {chartData.reduce((sum, d) => sum + d.orders, 0).toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Total Customers</p>
          <p className="text-lg font-bold text-gray-900">
            {chartData.reduce((sum, d) => sum + d.customers, 0).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}