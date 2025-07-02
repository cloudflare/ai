'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Bot, 
  User, 
  Loader2, 
  Database,
  Sparkles,
  Save,
  Brain,
  Network,
  Settings,
  ChevronDown,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RestaurantIntelligenceAgent, AGENT_CAPABILITIES } from '@/lib/ai/agents/restaurant-agent';
import { KnowledgeExtractor } from '@/lib/ai/knowledge-extractor';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    toolCalls?: any[];
    extractedKnowledge?: any;
    savedToGraph?: boolean;
  };
}

interface AgentChatProps {
  restaurantId: string;
  onKnowledgeExtracted?: (knowledge: any) => void;
  className?: string;
}

export function AgentChat({ restaurantId, onKnowledgeExtracted, className }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agent, setAgent] = useState<RestaurantIntelligenceAgent | null>(null);
  const [extractor, setExtractor] = useState<KnowledgeExtractor | null>(null);
  const [autoSaveToGraph, setAutoSaveToGraph] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([
    AGENT_CAPABILITIES.ANALYTICS,
    AGENT_CAPABILITIES.KNOWLEDGE_EXTRACTION,
    AGENT_CAPABILITIES.PREDICTIVE_MODELING,
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Initialize agent and extractor
  useEffect(() => {
    if (!agent) {
      const newAgent = new RestaurantIntelligenceAgent({
        apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY || '',
        restaurantId,
        capabilities: selectedCapabilities as any[],
      });
      setAgent(newAgent);
    }
    
    if (!extractor) {
      setExtractor(new KnowledgeExtractor(restaurantId));
    }
  }, [restaurantId, selectedCapabilities, agent, extractor]);
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !agent) return;
    
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Process message with agent
      const response = await agent.processMessage(input, {
        saveToGraph: autoSaveToGraph,
        context: {
          userRole: 'Manager', // Could be dynamic based on auth
        },
      });
      
      const assistantMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        metadata: {
          toolCalls: response.metadata?.toolCalls,
          extractedKnowledge: response.extractedKnowledge,
          savedToGraph: autoSaveToGraph && response.extractedKnowledge,
        },
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Notify parent of extracted knowledge
      if (response.extractedKnowledge && onKnowledgeExtracted) {
        onKnowledgeExtracted(response.extractedKnowledge);
      }
    } catch (error) {
      console.error('Agent error:', error);
      const errorMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };
  
  const saveConversationToGraph = async () => {
    if (!extractor || messages.length === 0) return;
    
    try {
      const extraction = await extractor.extractFromConversation(
        messages.map(m => ({ role: m.role, content: m.content }))
      );
      
      const result = await extractor.saveToGraph(extraction);
      
      console.log('Saved to graph:', result);
      
      // Show success feedback
      const successMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Successfully saved conversation to knowledge graph: ${result.savedEntities} entities and ${result.savedRelationships} relationships extracted.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);
    } catch (error) {
      console.error('Failed to save to graph:', error);
    }
  };
  
  const toggleCapability = (capability: string) => {
    setSelectedCapabilities(prev => 
      prev.includes(capability)
        ? prev.filter(c => c !== capability)
        : [...prev, capability]
    );
  };
  
  const examplePrompts = [
    "What are our peak hours this week?",
    "Analyze customer sentiment from recent reviews",
    "Which menu items have the highest profit margins?",
    "Predict sales for next weekend",
    "Show me staffing optimization opportunities",
  ];
  
  return (
    <div className={`flex flex-col h-full bg-white rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center">
          <Brain className="w-6 h-6 text-purple-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">AI Restaurant Agent</h2>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Auto-save toggle */}
          <button
            onClick={() => setAutoSaveToGraph(!autoSaveToGraph)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              autoSaveToGraph
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {autoSaveToGraph ? <Database className="w-4 h-4" /> : <Database className="w-4 h-4" />}
            {autoSaveToGraph ? 'Auto-saving' : 'Not saving'}
          </button>
          
          {/* Manual save button */}
          <button
            onClick={saveConversationToGraph}
            disabled={messages.length === 0}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="Save conversation to knowledge graph"
          >
            <Save className="w-4 h-4" />
          </button>
          
          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          {/* Metadata toggle */}
          <button
            onClick={() => setShowMetadata(!showMetadata)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            title={showMetadata ? 'Hide metadata' : 'Show metadata'}
          >
            {showMetadata ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-gray-200 overflow-hidden"
          >
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-700">Agent Capabilities</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(AGENT_CAPABILITIES).map(([key, value]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCapabilities.includes(value)}
                      onChange={() => toggleCapability(value)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="capitalize">{value.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className="w-12 h-12 text-purple-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              Start a conversation with your AI restaurant assistant
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {examplePrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => setInput(prompt)}
                  className="text-xs px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`flex gap-3 max-w-[80%] ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              
              <div className="space-y-1">
                <div
                  className={`px-4 py-2 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                
                {/* Metadata */}
                {showMetadata && message.metadata && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-gray-500 space-y-1"
                  >
                    {message.metadata.toolCalls && message.metadata.toolCalls.length > 0 && (
                      <p>Used tools: {message.metadata.toolCalls.map(t => t.function.name).join(', ')}</p>
                    )}
                    {message.metadata.savedToGraph && (
                      <p className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        Saved to knowledge graph
                      </p>
                    )}
                    {message.metadata.extractedKnowledge && (
                      <details>
                        <summary className="cursor-pointer">
                          Extracted {message.metadata.extractedKnowledge.entities?.length || 0} entities
                        </summary>
                        <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                          {JSON.stringify(message.metadata.extractedKnowledge, null, 2)}
                        </pre>
                      </details>
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <Bot className="w-4 h-4 text-gray-700" />
            </div>
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your restaurant data..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}