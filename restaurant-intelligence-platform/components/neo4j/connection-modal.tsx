'use client';

import { useState } from 'react';
import { X, Database, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Neo4jConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (config: Neo4jConfig) => Promise<void>;
  currentConfig?: Neo4jConfig;
}

interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export function Neo4jConnectionModal({
  isOpen,
  onClose,
  onConnect,
  currentConfig,
}: Neo4jConnectionModalProps) {
  const [config, setConfig] = useState<Neo4jConfig>({
    uri: currentConfig?.uri || 'bolt://localhost:7687',
    username: currentConfig?.username || 'neo4j',
    password: currentConfig?.password || '',
    database: currentConfig?.database || 'neo4j',
  });
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setConnectionStatus({ type: null, message: '' });
    
    try {
      await onConnect(config);
      setConnectionStatus({
        type: 'success',
        message: 'Successfully connected to Neo4j!',
      });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      setConnectionStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setIsConnecting(false);
    }
  };
  
  const testConnection = async () => {
    setIsConnecting(true);
    setConnectionStatus({ type: null, message: '' });
    
    try {
      const response = await fetch('/api/neo4j/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setConnectionStatus({
          type: 'success',
          message: `Connected! Neo4j version: ${result.version}`,
        });
      } else {
        setConnectionStatus({
          type: 'error',
          message: result.error || 'Connection test failed',
        });
      }
    } catch (error) {
      setConnectionStatus({
        type: 'error',
        message: 'Failed to test connection',
      });
    } finally {
      setIsConnecting(false);
    }
  };
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center">
                  <Database className="w-6 h-6 text-indigo-600 mr-3" />
                  <h2 className="text-xl font-semibold text-gray-900">
                    Neo4j Connection
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Connection URI
                  </label>
                  <input
                    type="text"
                    value={config.uri}
                    onChange={(e) => setConfig({ ...config, uri: e.target.value })}
                    placeholder="bolt://localhost:7687"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Neo4j Bolt protocol URI
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                    placeholder="neo4j"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Database (optional)
                  </label>
                  <input
                    type="text"
                    value={config.database}
                    onChange={(e) => setConfig({ ...config, database: e.target.value })}
                    placeholder="neo4j"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Leave empty to use the default database
                  </p>
                </div>
                
                {/* Connection Status */}
                <AnimatePresence>
                  {connectionStatus.type && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`p-3 rounded-lg flex items-center ${
                        connectionStatus.type === 'success'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {connectionStatus.type === 'success' ? (
                        <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                      )}
                      <span className="text-sm">{connectionStatus.message}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={isConnecting}
                    className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isConnecting && connectionStatus.type === null ? (
                      <span className="flex items-center justify-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Testing...
                      </span>
                    ) : (
                      'Test Connection'
                    )}
                  </button>
                  
                  <button
                    type="submit"
                    disabled={isConnecting}
                    className="flex-1 py-2 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isConnecting && connectionStatus.type === null ? (
                      <span className="flex items-center justify-center">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </span>
                    ) : (
                      'Connect'
                    )}
                  </button>
                </div>
              </form>
              
              {/* Help Section */}
              <div className="px-6 pb-6">
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                    Need help connecting?
                  </summary>
                  <div className="mt-2 space-y-2 text-gray-600">
                    <p>
                      <strong>Local Neo4j:</strong> Use <code className="px-1 py-0.5 bg-gray-100 rounded">bolt://localhost:7687</code>
                    </p>
                    <p>
                      <strong>Neo4j Aura:</strong> Use the connection URI from your Aura console
                    </p>
                    <p>
                      <strong>Docker:</strong> Use <code className="px-1 py-0.5 bg-gray-100 rounded">bolt://neo4j:7687</code> or container name
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}