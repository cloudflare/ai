'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Mic, 
  MicOff, 
  Download, 
  Paperclip, 
  X, 
  Bot, 
  User, 
  Sparkles, 
  Settings,
  Copy,
  Check,
  Share2,
  RotateCcw,
  Database,
  FileText,
  BarChart,
  MessageSquare
} from 'lucide-react';
import { AIService, ConversationMessage } from '@/lib/ai/ai-service';
import { useAIStreaming } from '@/lib/hooks/use-ai-streaming';
import { ConversationContext } from '@/lib/ai/openai-stream';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ChatInterfaceProps {
  conversationId?: string;
  context?: ConversationContext;
  onExport?: (data: string) => void;
  onConnect?: () => void;
  isConnected?: boolean;
  className?: string;
}

interface FileAttachment {
  id: string;
  filename: string;
  content: string;
  type: string;
  size: number;
}

interface MessageAction {
  label: string;
  icon: React.ElementType;
  action: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  conversationId = 'default',
  context: initialContext,
  onExport,
  onConnect,
  isConnected = false,
  className
}) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const aiService = useRef(new AIService()).current;
  const { streamMessage, isStreaming, currentMessage } = useAIStreaming();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentMessage]);

  useEffect(() => {
    if (messages.length > 0) {
      setShowWelcome(false);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;

    const userMessage: ConversationMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
      metadata: { attachments: attachments.length > 0 ? attachments : undefined }
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setShowWelcome(false);

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
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error(`File ${file.name} is too large. Maximum size is 10MB.`);
        return;
      }

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
        toast.success(`File ${file.name} attached`);
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

  const handleCopyMessage = (message: ConversationMessage) => {
    navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    setTimeout(() => setCopiedMessageId(null), 2000);
    toast.success('Message copied to clipboard');
  };

  const handleShareConversation = () => {
    const shareableText = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    
    if (navigator.share) {
      navigator.share({
        title: 'Restaurant Intelligence Conversation',
        text: shareableText
      });
    } else {
      navigator.clipboard.writeText(shareableText);
      toast.success('Conversation copied to clipboard');
    }
  };

  const handleClearConversation = () => {
    setMessages([]);
    setAttachments([]);
    aiService.clearConversation(conversationId);
    setShowWelcome(true);
    toast.success('Conversation cleared');
  };

  const suggestedPrompts = [
    { icon: BarChart, text: "Analyze my restaurant's performance this month" },
    { icon: MessageSquare, text: "Generate marketing content for upcoming promotion" },
    { icon: FileText, text: "Review and summarize recent customer feedback" },
    { icon: Database, text: "What insights can you extract from my sales data?" }
  ];

  const renderMessage = (message: ConversationMessage) => {
    const isUser = message.role === 'user';
    
    const messageActions: MessageAction[] = [
      {
        label: 'Copy',
        icon: copiedMessageId === message.id ? Check : Copy,
        action: () => handleCopyMessage(message)
      }
    ];

    return (
      <div
        key={message.id}
        className={`group flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} px-4 py-2 hover:bg-muted/50 transition-colors`}
      >
        <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}>
            {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
          </div>
          
          <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
            <div className={`rounded-lg px-4 py-2 ${
              isUser 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted border border-border'
            }`}>
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              
              {message.metadata?.attachments && message.metadata.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {message.metadata.attachments.map((attachment: FileAttachment) => (
                    <Badge 
                      key={attachment.id} 
                      variant={isUser ? "secondary" : "outline"} 
                      className="text-xs"
                    >
                      <Paperclip className="w-3 h-3 mr-1" />
                      {attachment.filename}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {format(new Date(message.timestamp), 'HH:mm')}
              </span>
              
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                {messageActions.map((action, index) => (
                  <Button
                    key={index}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={action.action}
                  >
                    <action.icon className="w-3 h-3" />
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Sparkles className="w-5 h-5 text-primary" />
              <div className={`absolute -bottom-1 -right-1 w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-gray-400'
              }`} />
            </div>
            <div>
              <h3 className="font-semibold">AI Assistant</h3>
              <p className="text-xs text-muted-foreground">
                {isConnected ? 'Connected to Knowledge Graph' : 'Offline Mode'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!isConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={onConnect}
              >
                <Database className="w-4 h-4 mr-1" />
                Connect
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Conversation</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShareConversation}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClearConversation} className="text-destructive">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1">
        {showWelcome && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Bot className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Welcome to Restaurant Intelligence</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              I can help you analyze data, generate insights, create marketing content, and answer questions about your restaurant operations.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {suggestedPrompts.map((prompt, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="justify-start text-left h-auto p-3"
                  onClick={() => {
                    setInput(prompt.text);
                    setShowWelcome(false);
                  }}
                >
                  <prompt.icon className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span className="text-xs">{prompt.text}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4">
            {messages.map(renderMessage)}
            
            {isStreaming && currentMessage && (
              <div className="group flex gap-3 justify-start px-4 py-2">
                <div className="flex gap-3 max-w-[85%]">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="w-4 h-4 animate-pulse" />
                  </div>
                  
                  <div className="rounded-lg px-4 py-2 bg-muted border border-border">
                    <p className="text-sm whitespace-pre-wrap break-words">{currentMessage}</p>
                    <div className="flex gap-1 mt-2">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-4">
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map(attachment => (
              <Badge key={attachment.id} variant="secondary" className="flex items-center gap-1 pr-1">
                <Paperclip className="w-3 h-3" />
                <span className="text-xs max-w-[150px] truncate">{attachment.filename}</span>
                <button
                  onClick={() => setAttachments(prev => prev.filter(a => a.id !== attachment.id))}
                  className="ml-1 hover:text-destructive transition-colors"
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
            accept=".txt,.csv,.json,.pdf,.doc,.docx"
          />
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={handleVoiceInput}
            disabled={isStreaming}
            className={isRecording ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
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
            placeholder={isStreaming ? "AI is thinking..." : "Ask me anything about your restaurant..."}
            className="flex-1 min-h-[40px] max-h-[120px] resize-none"
            disabled={isStreaming}
          />
          
          <Button
            onClick={handleSend}
            disabled={(!input.trim() && attachments.length === 0) || isStreaming}
            className="self-end"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">
            {isStreaming ? 'Generating response...' : 'Press Enter to send, Shift+Enter for new line'}
          </p>
          {attachments.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {attachments.length} file{attachments.length > 1 ? 's' : ''} attached
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};