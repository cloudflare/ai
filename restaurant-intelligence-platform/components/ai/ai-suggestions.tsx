'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AIService } from '@/lib/ai/ai-service';
import { toast } from 'sonner';

interface AISuggestionsProps {
  fieldName: string;
  context: string;
  currentValue?: string;
  onSelect: (value: string) => void;
  className?: string;
  trigger?: 'hover' | 'click' | 'focus';
}

export const AISuggestions: React.FC<AISuggestionsProps> = ({
  fieldName,
  context,
  currentValue,
  onSelect,
  className,
  trigger = 'click'
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const aiService = new AIService();

  const loadSuggestions = async () => {
    if (suggestions.length > 0) return; // Don't reload if we already have suggestions

    setIsLoading(true);
    try {
      const newSuggestions = await aiService.generateSuggestions(
        context,
        fieldName,
        currentValue
      );
      setSuggestions(newSuggestions);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      toast.error('Failed to load AI suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && suggestions.length === 0) {
      loadSuggestions();
    }
  }, [isOpen]);

  const handleSelect = (suggestion: string) => {
    onSelect(suggestion);
    setIsOpen(false);
    toast.success('AI suggestion applied');
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 px-2 ${className}`}
          onMouseEnter={trigger === 'hover' ? () => setIsOpen(true) : undefined}
          onFocus={trigger === 'focus' ? () => setIsOpen(true) : undefined}
        >
          <Sparkles className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Suggestions for {fieldName}
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-1">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSelect(suggestion)}
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No suggestions available
            </p>
          )}
          
          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadSuggestions}
              disabled={isLoading}
              className="w-full text-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Loading...
                </>
              ) : (
                'Refresh suggestions'
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface SmartInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  fieldName: string;
  context: string;
  showSuggestions?: boolean;
}

export const SmartInput: React.FC<SmartInputProps> = ({
  fieldName,
  context,
  showSuggestions = true,
  className,
  value,
  onChange,
  ...props
}) => {
  const [inputValue, setInputValue] = useState(value || '');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onChange?.(e);
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setInputValue(suggestion);
    const event = {
      target: { value: suggestion }
    } as React.ChangeEvent<HTMLInputElement>;
    onChange?.(event);
  };

  return (
    <div className="relative">
      <input
        {...props}
        value={inputValue}
        onChange={handleChange}
        className={`pr-10 ${className}`}
      />
      {showSuggestions && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <AISuggestions
            fieldName={fieldName}
            context={context}
            currentValue={inputValue as string}
            onSelect={handleSuggestionSelect}
          />
        </div>
      )}
    </div>
  );
};

interface SmartTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  fieldName: string;
  context: string;
  showSuggestions?: boolean;
}

export const SmartTextarea: React.FC<SmartTextareaProps> = ({
  fieldName,
  context,
  showSuggestions = true,
  className,
  value,
  onChange,
  ...props
}) => {
  const [textValue, setTextValue] = useState(value || '');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextValue(e.target.value);
    onChange?.(e);
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setTextValue(suggestion);
    const event = {
      target: { value: suggestion }
    } as React.ChangeEvent<HTMLTextAreaElement>;
    onChange?.(event);
  };

  return (
    <div className="relative">
      <textarea
        {...props}
        value={textValue}
        onChange={handleChange}
        className={`pr-10 ${className}`}
      />
      {showSuggestions && (
        <div className="absolute right-1 top-1">
          <AISuggestions
            fieldName={fieldName}
            context={context}
            currentValue={textValue as string}
            onSelect={handleSuggestionSelect}
          />
        </div>
      )}
    </div>
  );
};