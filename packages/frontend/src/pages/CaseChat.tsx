// Case Chat Page

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Send, ArrowLeft, Loader2, Wrench, CheckCircle, XCircle, AlertTriangle, User, Bot } from 'lucide-react';
import { casesApi, chatApi } from '@/api/client';

export function CaseChat() {
  const { id: caseId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: caseData, isLoading: caseLoading } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => casesApi.get(caseId!),
    enabled: !!caseId,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['chat-history', caseId],
    queryFn: () => chatApi.history(caseId!),
    enabled: !!caseId,
  });

  const sendMutation = useMutation({
    mutationFn: (msg: string) => chatApi.send(caseId!, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-history', caseId] });
      setMessage('');
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [historyData?.steps]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!message.trim() || sendMutation.isPending) return;
    sendMutation.mutate(message.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (caseLoading || historyLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card">
        <Link
          to={`/cases?domain_id=${caseData?.domainId}`}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="font-medium">{caseData?.title || 'Untitled Case'}</h1>
          <p className="text-xs text-muted-foreground">
            {caseData?.domainName} - {caseData?.status}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {historyData?.steps.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Start the conversation by sending a message below.</p>
            <p className="text-sm mt-2">The expert agent will help you with your query.</p>
          </div>
        )}

        {historyData?.steps.map((step) => (
          <ChatStep key={step.id} step={step} />
        ))}

        {sendMutation.isPending && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Agent is thinking...</span>
          </div>
        )}

        {sendMutation.isError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
            <AlertTriangle size={18} />
            <span className="text-sm">
              {sendMutation.error instanceof Error
                ? sendMutation.error.message
                : 'Failed to send message'}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 px-4 py-3 bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            rows={1}
            disabled={sendMutation.isPending || caseData?.status !== 'open'}
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending || caseData?.status !== 'open'}
            className="px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {sendMutation.isPending ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
          </button>
        </div>
        {caseData?.status !== 'open' && (
          <p className="text-center text-sm text-muted-foreground mt-2">
            This case is {caseData?.status}. No new messages can be sent.
          </p>
        )}
      </div>
    </div>
  );
}

function ChatStep({ step }: { step: any }) {
  const content = typeof step.content === 'string' ? JSON.parse(step.content) : step.content;

  switch (step.type) {
    case 'user_message':
      return (
        <div className="flex items-start gap-3 justify-end">
          <div className="bg-primary text-primary-foreground rounded-lg p-3 max-w-xl">
            <p className="text-sm whitespace-pre-wrap">{content.text}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <User size={16} />
          </div>
        </div>
      );

    case 'assistant_message':
      return (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
            <Bot size={16} className="text-green-600 dark:text-green-400" />
          </div>
          <div className="bg-muted rounded-lg p-3 max-w-xl">
            <p className="text-sm whitespace-pre-wrap">{content.text}</p>
          </div>
        </div>
      );

    case 'error':
      return (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <XCircle size={16} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 max-w-xl">
            <p className="text-sm text-red-700 dark:text-red-300">{content.error}</p>
          </div>
        </div>
      );

    case 'tool_call':
      return (
        <div className="flex items-start gap-3 ml-8">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Wrench size={16} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 max-w-xl">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Calling tool: {content.toolName}
            </p>
            {content.inputs && Object.keys(content.inputs).length > 0 && (
              <pre className="text-xs mt-2 text-blue-600 dark:text-blue-400 overflow-x-auto">
                {JSON.stringify(content.inputs, null, 2)}
              </pre>
            )}
          </div>
        </div>
      );

    case 'tool_result':
      const isSuccess = content.status === 'completed';
      const isWaitingHitl = content.status === 'waiting_hitl';
      return (
        <div className="flex items-start gap-3 ml-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            isSuccess
              ? 'bg-green-100 dark:bg-green-900/30'
              : isWaitingHitl
              ? 'bg-yellow-100 dark:bg-yellow-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            {isSuccess ? (
              <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
            ) : isWaitingHitl ? (
              <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400" />
            ) : (
              <XCircle size={16} className="text-red-600 dark:text-red-400" />
            )}
          </div>
          <div className={`rounded-lg p-3 max-w-xl ${
            isSuccess
              ? 'bg-green-50 dark:bg-green-900/20'
              : isWaitingHitl
              ? 'bg-yellow-50 dark:bg-yellow-900/20'
              : 'bg-red-50 dark:bg-red-900/20'
          }`}>
            <p className={`text-sm font-medium ${
              isSuccess
                ? 'text-green-700 dark:text-green-300'
                : isWaitingHitl
                ? 'text-yellow-700 dark:text-yellow-300'
                : 'text-red-700 dark:text-red-300'
            }`}>
              {isSuccess ? 'Tool completed' : isWaitingHitl ? 'Waiting for approval' : 'Tool failed'}
            </p>
            {content.outputs && (
              <pre className="text-xs mt-2 overflow-x-auto">
                {JSON.stringify(content.outputs, null, 2)}
              </pre>
            )}
            {content.error && (
              <p className="text-xs mt-2 text-red-600 dark:text-red-400">{content.error}</p>
            )}
          </div>
        </div>
      );

    case 'hitl_request':
      return (
        <div className="flex items-start gap-3 ml-8">
          <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 max-w-xl border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              Human approval required
            </p>
            <p className="text-sm mt-1 text-yellow-600 dark:text-yellow-400">
              {content.message || 'Please approve or reject this action.'}
            </p>
          </div>
        </div>
      );

    case 'hitl_response':
      const approved = content.status === 'approved';
      return (
        <div className="flex items-start gap-3 ml-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            approved ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            {approved ? (
              <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
            ) : (
              <XCircle size={16} className="text-red-600 dark:text-red-400" />
            )}
          </div>
          <div className={`rounded-lg p-3 max-w-xl ${
            approved ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
          }`}>
            <p className={`text-sm font-medium ${
              approved ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
            }`}>
              {approved ? 'Approved' : 'Rejected'}
            </p>
          </div>
        </div>
      );

    default:
      return null;
  }
}
