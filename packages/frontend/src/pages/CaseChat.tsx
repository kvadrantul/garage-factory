// Case Chat Page

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Send, ArrowLeft, Loader2, Wrench, CheckCircle, XCircle, AlertTriangle, User, Bot, ThumbsUp, ThumbsDown, Paperclip, FileText, X, Download } from 'lucide-react';
import { casesApi, chatApi, hitlApi } from '@/api/client';
import { CasesSidebar } from '@/components/expert/CasesSidebar';

export function CaseChat() {
  const { id: caseId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    onMutate: (msg) => {
      // Immediately show message as bubble and clear input
      setPendingMessage(msg);
      setMessage('');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-history', caseId] });
    },
    onSettled: () => {
      setPendingMessage(null);
      // Re-focus input after agent finishes
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ msg, files }: { msg: string; files: File[] }) =>
      chatApi.upload(caseId!, msg, files),
    onMutate: ({ msg }) => {
      setPendingMessage(msg || null);
      setPendingFiles([]);
      setMessage('');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-history', caseId] });
    },
    onSettled: () => {
      setPendingMessage(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  const isPending = sendMutation.isPending || uploadMutation.isPending;

  // Scroll to bottom on new messages or pending message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [historyData?.steps, pendingMessage]);

  // Focus input on load and when caseId changes (sidebar navigation)
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [caseId]);

  const handleSend = () => {
    if (isPending) return;
    if (pendingFiles.length > 0) {
      uploadMutation.mutate({ msg: message.trim(), files: pendingFiles });
    } else if (message.trim()) {
      sendMutation.mutate(message.trim());
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
    // Reset input so selecting the same file again triggers onChange
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
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
    <div className="h-screen flex flex-row bg-background">
      {/* Cases Sidebar */}
      {caseData?.domainId && (
        <CasesSidebar
          domainId={caseData.domainId}
          currentCaseId={caseId!}
          steps={historyData?.steps || []}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
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
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {historyData?.steps.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p>Start the conversation by sending a message below.</p>
                <p className="text-sm mt-2">The expert agent will help you with your query.</p>
              </div>
            )}

            {historyData?.steps.map((step: any) => (
              <ChatStep key={step.id} step={step} caseId={caseId!} queryClient={queryClient} />
            ))}

            {/* Show pending message as immediate user bubble */}
            {pendingMessage && (
              <div className="flex items-start gap-3 justify-end">
                <div className="bg-primary text-primary-foreground rounded-lg p-3 max-w-xl">
                  <p className="text-sm whitespace-pre-wrap">{pendingMessage}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User size={16} />
                </div>
              </div>
            )}

            {isPending && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Agent is thinking...</span>
              </div>
            )}

            {(sendMutation.isError || uploadMutation.isError) && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                <AlertTriangle size={18} />
                <span className="text-sm">
                  {(sendMutation.error || uploadMutation.error) instanceof Error
                    ? (sendMutation.error || uploadMutation.error)!.message
                    : 'Failed to send message'}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-card">
          <div className="max-w-4xl mx-auto space-y-2">
            {/* File chips */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-md text-xs"
                  >
                    <FileText size={12} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                    <span className="truncate max-w-[150px] text-indigo-700 dark:text-indigo-300">
                      {f.name}
                    </span>
                    <span className="text-indigo-500 dark:text-indigo-400 flex-shrink-0">
                      {formatFileSize(f.size)}
                    </span>
                    <button
                      onClick={() => removeFile(i)}
                      className="ml-0.5 p-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-colors"
                    >
                      <X size={12} className="text-indigo-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Input row */}
            <div className="flex gap-2">
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="sr-only"
                tabIndex={-1}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending || caseData?.status !== 'open'}
                className="px-3 py-3 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                title="Attach files"
              >
                <Paperclip size={18} />
              </button>
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isPending ? "Agent is processing..." : "Type your message..."}
                className="flex-1 px-4 py-3 bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                rows={1}
                disabled={caseData?.status !== 'open'}
              />
              <button
                onClick={handleSend}
                disabled={(!message.trim() && pendingFiles.length === 0) || isPending || caseData?.status !== 'open'}
                className="px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </div>
          </div>
          {caseData?.status !== 'open' && (
            <p className="text-center text-sm text-muted-foreground mt-2">
              This case is {caseData?.status}. No new messages can be sent.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatStep({ step, caseId, queryClient }: { step: any; caseId: string; queryClient: any }) {
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

    case 'tool_result': {
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
    }

    case 'hitl_request':
      return (
        <HITLRequestCard
          step={step}
          content={content}
          caseId={caseId}
          queryClient={queryClient}
        />
      );

    case 'hitl_response': {
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
            {content.reason && (
              <p className="text-xs mt-1 opacity-75">Reason: {content.reason}</p>
            )}
          </div>
        </div>
      );
    }

    case 'file_upload': {
      const fileList = content.files as Array<{ name: string; originalName: string; size: number; mimeType: string; path: string }>;
      return (
        <div className="flex items-start gap-3 justify-end">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 max-w-xl border border-indigo-200 dark:border-indigo-800">
            <div className="flex items-center gap-1.5 mb-2">
              <Paperclip size={14} className="text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                Files attached
              </span>
            </div>
            <div className="space-y-1.5">
              {fileList?.map((file, i) => (
                <a
                  key={i}
                  href={`/${file.path}`}
                  target="_blank"
                  rel="noreferrer"
                  download={file.originalName}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors group"
                >
                  <FileText size={14} className="text-indigo-500 flex-shrink-0" />
                  <span className="text-sm text-indigo-700 dark:text-indigo-300 truncate max-w-[200px]">
                    {file.originalName}
                  </span>
                  <span className="text-xs text-indigo-400 flex-shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                  <Download size={12} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <User size={16} />
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * Interactive HITL Request Card - renders approval buttons, input forms, or selection options
 */
function HITLRequestCard({
  step,
  content,
  caseId,
  queryClient,
}: {
  step: any;
  content: any;
  caseId: string;
  queryClient: any;
}) {
  const hitlDetails = step.hitl_details;
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [selectedOption, setSelectedOption] = useState('');

  const respondMutation = useMutation({
    mutationFn: (payload: { action: string; data?: any; reason?: string }) =>
      hitlApi.respond(hitlDetails.hitl_id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-history', caseId] });
    },
  });

  // No HITL details available - show basic read-only card
  if (!hitlDetails) {
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
  }

  const isPending = hitlDetails.status === 'pending';
  const isResponding = respondMutation.isPending;

  // Already responded - show read-only status
  if (!isPending) {
    const wasApproved = hitlDetails.status === 'approved';
    return (
      <div className="flex items-start gap-3 ml-8">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          wasApproved ? 'bg-green-100 dark:bg-green-900/30' : hitlDetails.status === 'timeout' ? 'bg-gray-100 dark:bg-gray-900/30' : 'bg-red-100 dark:bg-red-900/30'
        }`}>
          {wasApproved ? (
            <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
          ) : (
            <XCircle size={16} className={hitlDetails.status === 'timeout' ? 'text-gray-500' : 'text-red-600 dark:text-red-400'} />
          )}
        </div>
        <div className={`rounded-lg p-3 max-w-xl border ${
          wasApproved
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : hitlDetails.status === 'timeout'
            ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        }`}>
          <p className={`text-sm font-medium ${
            wasApproved ? 'text-green-700 dark:text-green-300' : hitlDetails.status === 'timeout' ? 'text-gray-600' : 'text-red-700 dark:text-red-300'
          }`}>
            {hitlDetails.message}
          </p>
          <p className="text-xs mt-1 opacity-60">
            {wasApproved ? 'Approved' : hitlDetails.status === 'timeout' ? 'Timed out' : 'Rejected'}
          </p>
        </div>
      </div>
    );
  }

  // Pending - render interactive form based on type
  return (
    <div className="flex items-start gap-3 ml-8">
      <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
        <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400" />
      </div>
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 max-w-xl border border-yellow-200 dark:border-yellow-800">
        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
          {hitlDetails.message || 'Human approval required'}
        </p>

        {hitlDetails.details && (
          <p className="text-xs mt-1 text-yellow-600 dark:text-yellow-400">
            {hitlDetails.details}
          </p>
        )}

        {respondMutation.isError && (
          <p className="text-xs mt-2 text-red-600">
            {respondMutation.error instanceof Error ? respondMutation.error.message : 'Failed to respond'}
          </p>
        )}

        {/* Approval type: Approve / Reject buttons */}
        {hitlDetails.type === 'approval' && (
          <div className="mt-3 space-y-2">
            {showRejectInput ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (optional)"
                  className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => respondMutation.mutate({ action: 'reject', reason: rejectReason || undefined })}
                    disabled={isResponding}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isResponding ? <Loader2 size={14} className="animate-spin" /> : <ThumbsDown size={14} />}
                    Confirm Reject
                  </button>
                  <button
                    onClick={() => setShowRejectInput(false)}
                    className="px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => respondMutation.mutate({ action: 'approve' })}
                  disabled={isResponding}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {isResponding ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                  Approve
                </button>
                <button
                  onClick={() => setShowRejectInput(true)}
                  disabled={isResponding}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  <ThumbsDown size={14} />
                  Reject
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input type: Dynamic form fields */}
        {hitlDetails.type === 'input' && hitlDetails.fields && (
          <div className="mt-3 space-y-3">
            {hitlDetails.fields.map((field: any) => (
              <div key={field.name}>
                <label className="block text-xs font-medium text-yellow-700 dark:text-yellow-300 mb-1">
                  {field.label}{field.required && ' *'}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={formData[field.name] ?? field.default ?? ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={3}
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={formData[field.name] ?? field.default ?? ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt: any) => (
                      <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                    ))}
                  </select>
                ) : field.type === 'boolean' ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData[field.name] ?? field.default ?? false}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.checked })}
                      className="rounded border-border"
                    />
                    <span className="text-sm">{field.label}</span>
                  </label>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={formData[field.name] ?? field.default ?? ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: field.type === 'number' ? Number(e.target.value) : e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
            ))}
            <button
              onClick={() => respondMutation.mutate({ action: 'submit', data: formData })}
              disabled={isResponding}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isResponding ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Submit
            </button>
          </div>
        )}

        {/* Selection type: Radio options */}
        {hitlDetails.type === 'selection' && hitlDetails.options && (
          <div className="mt-3 space-y-2">
            {hitlDetails.options.map((opt: any) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                  selectedOption === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  name={`hitl-selection-${step.id}`}
                  value={opt.value}
                  checked={selectedOption === opt.value}
                  onChange={() => setSelectedOption(opt.value)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium">{opt.label}</span>
                  {opt.description && (
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  )}
                </div>
              </label>
            ))}
            <button
              onClick={() => respondMutation.mutate({ action: 'submit', data: { selection: selectedOption } })}
              disabled={isResponding || !selectedOption}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isResponding ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Confirm Selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
