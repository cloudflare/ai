'use client';

import { useState, useTransition } from 'react';
import { Search, Loader2, Sparkles } from 'lucide-react';
import { processNaturalLanguageQuery } from '@/app/actions';
import { motion, AnimatePresence } from 'framer-motion';

export function NaturalLanguageQuery() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const exampleQueries = [
    "What were our sales yesterday?",
    "Show me the busiest hours this week",
    "Compare revenue between lunch and dinner",
    "Which menu items are trending up?",
    "Alert me when labor cost exceeds 30%"
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setError(null);
    startTransition(async () => {
      const response = await processNaturalLanguageQuery(query);
      
      if (response.success) {
        setResult(response.data);
      } else {
        setError(response.error || 'Failed to process query');
      }
    });
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center mb-4">
        <Sparkles className="w-5 h-5 text-purple-600 mr-2" />
        <h2 className="text-lg font-semibold text-gray-900">Ask AI Assistant</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about your restaurant data..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isPending}
          />
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
          {isPending && (
            <Loader2 className="absolute right-3 top-3.5 w-4 h-4 text-purple-600 animate-spin" />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {exampleQueries.map((example, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleExampleClick(example)}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
            >
              {example}
            </button>
          ))}
        </div>

        <button
          type="submit"
          disabled={isPending || !query.trim()}
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Processing...' : 'Ask AI'}
        </button>
      </form>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
          >
            {error}
          </motion.div>
        )}

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-6 space-y-4"
          >
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm font-medium text-purple-900 mb-1">
                Intent: {result.intent}
              </p>
              {result.entities && Object.keys(result.entities).length > 0 && (
                <div className="text-xs text-purple-700">
                  Entities: {JSON.stringify(result.entities, null, 2)}
                </div>
              )}
            </div>

            {result.queryResult && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm font-medium text-gray-900 mb-2">
                  Query Results:
                </p>
                <pre className="text-xs text-gray-700 overflow-x-auto">
                  {JSON.stringify(result.queryResult, null, 2)}
                </pre>
              </div>
            )}

            {result.visualization && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Suggested Visualization: {result.visualization.type}
                </p>
                <p className="text-xs text-blue-700">
                  Config: {JSON.stringify(result.visualization.config, null, 2)}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}