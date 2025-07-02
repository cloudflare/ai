'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Download, Paperclip, X, Bot, User, Sparkles } from 'lucide-react';
import { AIService, ConversationMessage } from '@/lib/ai/ai-service';
import { useAIStreaming } from '@/lib/hooks/use-ai-streaming';
import { ConversationContext } from '@/lib/ai/openai-stream';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

interface EnhancedAgentChatProps {
  conversationId?: string;
  context?: ConversationContext;
  onExport?: (data: string) => void;
  className?: string;
}

interface FileAttachment {
  id: string;
  filename: string;
  content: string;
  type: string;
  size: number;
}

export const EnhancedAgentChat: React.FC<EnhancedAgentChatProps> = ({
  conversationId = 'default',
  context: initialContext,
  onExport,
  className
}) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [marketingType, setMarketingType] = useState<'email' | 'social' | 'sms' | 'blog'>('email');
  const [marketingContext, setMarketingContext] = useState({
    restaurant: '',
    promotion: '',
    audience: '',
    tone: 'friendly'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const aiService = useRef(new AIService()).current;
  const { streamMessage, isStreaming, currentMessage } = useAIStreaming();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentMessage]);

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;

    const userMessage: ConversationMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
      metadata: { attachments }
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    const context: ConversationContext = {
      ...initialContext,
      fileContext: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        type: a.type
      }))
    };

    try {
      await streamMessage(
        input,
        conversationId,
        context,
        (token) => {
          // Token callback handled by hook
        },
        (fullText) => {
          const assistantMessage: ConversationMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: fullText,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, assistantMessage]);
          setAttachments([]);
        }
      );
    } catch (error) {
      toast.error('Failed to send message');
      console.error('Chat error:', error);
    }
  };

  const handleVoiceInput = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          // Here you would typically send the audio to a speech-to-text service
          // For now, we'll just show a placeholder
          toast.info('Voice input processing not implemented');
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        toast.error('Failed to access microphone');
        console.error('Microphone error:', error);
      }
    } else {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const attachment: FileAttachment = {
          id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          filename: file.name,
          content,
          type: file.type,
          size: file.size
        };
        setAttachments(prev => [...prev, attachment]);
      };
      reader.readAsText(file);
    });
  };

  const handleExport = () => {
    const exportData = aiService.exportConversation(conversationId);
    onExport?.(exportData);
    
    // Download as JSON file
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation_${conversationId}_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Conversation exported');
  };

  const handleGenerateMarketing = async () => {
    try {
      const response = await aiService.generateMarketingContent(
        marketingType,
        marketingContext
      );
      
      // This would be handled by streaming
      toast.success(`${marketingType} content generated`);
    } catch (error) {
      toast.error('Failed to generate marketing content');
      console.error('Marketing generation error:', error);
    }
  };

  const renderMessage = (message: ConversationMessage) => {
    const isUser = message.role === 'user';
    
    return (
      <div
        key={message.id}
        className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
      >
        <div className={`flex gap-3 max-w-[80%] ${isUser ? 'flex-row-reverse' : ''}`}>
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
          </div>
          
          <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
            <Card className={`px-4 py-2 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              
              {message.metadata?.attachments && message.metadata.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {message.metadata.attachments.map((attachment: FileAttachment) => (
                    <Badge key={attachment.id} variant="secondary" className="text-xs">
                      <Paperclip className="w-3 h-3 mr-1" />
                      {attachment.filename}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
            
            <span className="text-xs text-muted-foreground">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={`flex flex-col h-[600px] ${className}`}>
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">AI Assistant</h3>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExport}
            disabled={messages.length === 0}
          >
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-4">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col p-4 pt-2">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {messages.map(renderMessage)}
              
              {isStreaming && currentMessage && (
                <div className="flex gap-3 justify-start">
                  <div className="flex gap-3 max-w-[80%]">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    
                    <Card className="px-4 py-2 bg-muted">
                      <p className="text-sm whitespace-pre-wrap">{currentMessage}</p>
                    </Card>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map(attachment => (
                <Badge key={attachment.id} variant="secondary" className="flex items-center gap-1">
                  <Paperclip className="w-3 h-3" />
                  <span className="text-xs">{attachment.filename}</span>
                  <button
                    onClick={() => setAttachments(prev => prev.filter(a => a.id !== attachment.id))}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={handleVoiceInput}
              className={isRecording ? 'bg-destructive text-destructive-foreground' : ''}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 min-h-[40px] max-h-[120px]"
              disabled={isStreaming}
            />
            
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || isStreaming}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="marketing" className="flex-1 p-4">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Content Type</label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {(['email', 'social', 'sms', 'blog'] as const).map(type => (
                  <Button
                    key={type}
                    variant={marketingType === type ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMarketingType(type)}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Restaurant Name</label>
                <input
                  type="text"
                  value={marketingContext.restaurant}
                  onChange={(e) => setMarketingContext(prev => ({ ...prev, restaurant: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  placeholder="Enter restaurant name"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Promotion/Topic</label>
                <input
                  type="text"
                  value={marketingContext.promotion}
                  onChange={(e) => setMarketingContext(prev => ({ ...prev, promotion: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  placeholder="e.g., Happy Hour Special, New Menu Launch"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Target Audience</label>
                <input
                  type="text"
                  value={marketingContext.audience}
                  onChange={(e) => setMarketingContext(prev => ({ ...prev, audience: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                  placeholder="e.g., families, young professionals"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Tone</label>
                <select
                  value={marketingContext.tone}
                  onChange={(e) => setMarketingContext(prev => ({ ...prev, tone: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                >
                  <option value="friendly">Friendly & Casual</option>
                  <option value="professional">Professional</option>
                  <option value="exciting">Exciting & Energetic</option>
                  <option value="elegant">Elegant & Sophisticated</option>
                </select>
              </div>
            </div>

            <Button onClick={handleGenerateMarketing} className="w-full">
              <Sparkles className="w-4 h-4 mr-2" />
              Generate {marketingType.charAt(0).toUpperCase() + marketingType.slice(1)} Content
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="flex-1 p-4">
          <div className="text-center text-muted-foreground py-8">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Upload data files or connect to your restaurant systems to enable AI analysis</p>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
};