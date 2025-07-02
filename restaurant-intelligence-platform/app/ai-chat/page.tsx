'use client';

import React, { useState } from 'react';
import { ChatInterface } from '@/components/ai/chat-interface';
import { EnhancedConnectionModal } from '@/components/neo4j/enhanced-connection-modal';
import { initializeDriver } from '@/lib/utils/neo4j-driver';
import { Button } from '@/components/ui/button';
import { Database, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Neo4jConnectionConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export default function AIChatPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [connectionConfig, setConnectionConfig] = useState<Neo4jConnectionConfig | null>(null);

  const handleConnect = (config: Neo4jConnectionConfig) => {
    try {
      initializeDriver(config);
      setConnectionConfig(config);
      setIsConnected(true);
      setShowConnectionModal(false);
      toast.success('Connected to Neo4j database');
    } catch (error) {
      console.error('Connection failed:', error);
      toast.error('Failed to connect to Neo4j');
    }
  };

  const handleExport = (data: string) => {
    console.log('Exported conversation data:', data);
    toast.success('Conversation exported successfully');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Restaurant Intelligence AI</h1>
                <p className="text-sm text-muted-foreground">
                  Advanced AI assistant for restaurant operations
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {!isConnected && (
                <Button
                  onClick={() => setShowConnectionModal(true)}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  Connect to Neo4j
                </Button>
              )}
              
              {isConnected && connectionConfig && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  Connected to {new URL(connectionConfig.uri).hostname}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <ChatInterface
            conversationId="restaurant-chat"
            context={{
              restaurantId: 'demo-restaurant',
              dateRange: {
                start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
                end: new Date()
              }
            }}
            onExport={handleExport}
            onConnect={() => setShowConnectionModal(true)}
            isConnected={isConnected}
            className="h-[calc(100vh-200px)]"
          />
        </div>
      </div>

      {/* Connection Modal */}
      <EnhancedConnectionModal
        isOpen={showConnectionModal}
        onClose={() => setShowConnectionModal(false)}
        onConnect={handleConnect}
        initialConfig={{
          uri: 'bolt://localhost:7687',
          username: 'neo4j',
          database: 'neo4j'
        }}
      />
    </div>
  );
}