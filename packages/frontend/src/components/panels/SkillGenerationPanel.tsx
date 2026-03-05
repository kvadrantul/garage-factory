// Skill Generation Panel — right-side chat panel for WorkflowEditor

import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Send,
  Loader2,
  User,
  Bot,
  Sparkles,
  AlertTriangle,
  Upload,
  FileText,
  X,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { skillsChatApi } from '@/api/client';
import type { Node, Edge } from 'reactflow';

// ---------------------------------------------------------------------------
// Node visualization constants
// ---------------------------------------------------------------------------

const NODE_CATEGORIES: Record<string, string> = {
  'read-excel': 'extraction',
  'filter-rows': 'transformation',
  'group-by': 'transformation',
  'sort-rows': 'transformation',
  'select-columns': 'transformation',
  'format-output': 'generation',
  'write-excel': 'generation',
};

const NODE_COLORS: Record<string, string> = {
  extraction: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',
  transformation: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  generation: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SkillGenerationPanelProps {
  onClose: () => void;
  onWorkflowGenerated: (nodes: Node[], edges: Edge[], workflowName: string) => void;
  domainId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SkillGenerationPanel({ onClose, onWorkflowGenerated, domainId }: SkillGenerationPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start session on mount
  const startMutation = useMutation({
    mutationFn: () => skillsChatApi.start(domainId),
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setSteps(data.steps);
    },
    onError: (err) => {
      setInitError(err instanceof Error ? err.message : 'Failed to start session');
    },
  });

  useEffect(() => {
    startMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load generated workflow into canvas
  const loadToCanvas = useCallback(
    (content: any) => {
      const def = content.workflowDefinition;
      if (!def?.nodes || !def?.edges) return;

      const nodes: Node[] = def.nodes.map((n: any) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { ...n.data },
      }));

      const edges: Edge[] = def.edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      }));

      const workflowName = content.scenario?.name || 'Generated Workflow';
      onWorkflowGenerated(nodes, edges, workflowName);
    },
    [onWorkflowGenerated],
  );

  // Send message
  const sendMutation = useMutation({
    mutationFn: ({ msg, file }: { msg: string; file?: File }) =>
      skillsChatApi.send(sessionId!, msg, file || undefined),
    onMutate: ({ msg }) => {
      setPendingMessage(msg);
      setMessage('');
      setSampleFile(null);
    },
    onSuccess: (data) => {
      setSteps((prev) => [...prev, ...data.steps]);
      // Auto-load to canvas if generation succeeded
      const genStep = data.steps.find((s: any) => s.type === 'skill_generated');
      if (genStep) {
        const content = typeof genStep.content === 'string'
          ? JSON.parse(genStep.content)
          : genStep.content;
        loadToCanvas(content);
      }
    },
    onSettled: () => {
      setPendingMessage(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  const isPending = sendMutation.isPending;

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps, pendingMessage]);

  // Focus input after init
  useEffect(() => {
    if (sessionId) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [sessionId]);

  const handleSend = () => {
    if (isPending || !sessionId) return;
    const msg = message.trim();
    if (!msg && !sampleFile) return;
    sendMutation.mutate({ msg: msg || 'Generate from sample file', file: sampleFile || undefined });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSampleFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  return (
    <div className="w-96 bg-card border-l border-border flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" />
          <h2 className="font-semibold text-foreground">Generate Skill</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {startMutation.isPending && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {initError && (
          <div className="text-center py-6">
            <AlertTriangle className="mx-auto mb-2 text-red-500" size={24} />
            <p className="text-sm text-muted-foreground mb-2">{initError}</p>
            <button
              onClick={() => {
                setInitError(null);
                startMutation.mutate();
              }}
              className="text-sm text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {steps.map((step: any) => (
          <StepView key={step.id} step={step} />
        ))}

        {/* Pending user message */}
        {pendingMessage && (
          <div className="flex items-start gap-2 justify-end">
            <div className="bg-primary text-primary-foreground rounded-lg p-2.5 max-w-[80%]">
              <p className="text-xs whitespace-pre-wrap">{pendingMessage}</p>
            </div>
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User size={12} />
            </div>
          </div>
        )}

        {isPending && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Generating... 15-30s</span>
          </div>
        )}

        {sendMutation.isError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            <AlertTriangle size={14} />
            <span className="text-xs">
              {sendMutation.error instanceof Error
                ? sendMutation.error.message
                : 'Failed to send message'}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 p-3 border-t border-border">
        {/* File chip */}
        {sampleFile && (
          <div className="flex flex-wrap gap-1 mb-2">
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded text-xs">
              <FileText size={10} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
              <span className="truncate max-w-[120px] text-violet-700 dark:text-violet-300">
                {sampleFile.name}
              </span>
              <span className="text-violet-500 flex-shrink-0">
                {formatFileSize(sampleFile.size)}
              </span>
              <button
                onClick={() => setSampleFile(null)}
                className="ml-0.5 p-0.5 rounded hover:bg-violet-100 dark:hover:bg-violet-800/50"
              >
                <X size={10} className="text-violet-500" />
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-1.5">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="sr-only"
            tabIndex={-1}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || !sessionId}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50"
            title="Attach sample Excel file"
          >
            <Upload size={14} />
          </button>
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isPending ? 'Generating...' : 'Describe the workflow...'}
            className="flex-1 px-3 py-2 bg-background border border-border rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            rows={1}
            disabled={isPending || !sessionId}
          />
          <button
            onClick={handleSend}
            disabled={(!message.trim() && !sampleFile) || isPending || !sessionId}
            className="p-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step renderer
// ---------------------------------------------------------------------------

function StepView({ step }: { step: any }) {
  const content = typeof step.content === 'string' ? JSON.parse(step.content) : step.content;

  switch (step.type) {
    case 'user_message':
      return (
        <div className="flex items-start gap-2 justify-end">
          <div className="bg-primary text-primary-foreground rounded-lg p-2.5 max-w-[80%]">
            <p className="text-xs whitespace-pre-wrap">{content.text}</p>
          </div>
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <User size={12} />
          </div>
        </div>
      );

    case 'assistant_message':
      return (
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
            <Bot size={12} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div className="bg-muted rounded-lg p-2.5 max-w-[80%]">
            <p className="text-xs whitespace-pre-wrap">{content.text}</p>
          </div>
        </div>
      );

    case 'skill_generated':
      return <CompactGenerationCard content={content} />;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Compact generation card (fits in narrow panel)
// ---------------------------------------------------------------------------

function CompactGenerationCard({ content }: { content: any }) {
  const pipelineNodes = content.workflowDefinition?.nodes?.filter(
    (n: any) => n.type !== 'manual-trigger',
  ) || [];

  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
        <Sparkles size={12} className="text-violet-600 dark:text-violet-400" />
      </div>
      <div className="bg-card rounded-lg border border-border p-3 max-w-[85%]">
        <div className="flex items-center gap-1.5 mb-2">
          <CheckCircle size={12} className="text-green-600 dark:text-green-400" />
          <span className="text-xs font-medium">Loaded to canvas</span>
        </div>

        {/* Pipeline visualization */}
        <div className="flex items-center gap-1 flex-wrap p-2 bg-muted/50 rounded mb-2">
          {pipelineNodes.map((node: any, i: number) => {
            const cat = NODE_CATEGORIES[node.type] || 'transformation';
            const color = NODE_COLORS[cat] || NODE_COLORS.transformation;
            return (
              <div key={node.id} className="flex items-center gap-1">
                {i > 0 && <ArrowRight size={10} className="text-muted-foreground flex-shrink-0" />}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${color}`}>
                  {node.data?.name || node.type}
                </span>
              </div>
            );
          })}
        </div>

        {content.generationLog && (
          <p className="text-[10px] text-muted-foreground mb-1">{content.generationLog}</p>
        )}

        <p className="text-[10px] text-muted-foreground">
          Send another message to refine, or close the panel to edit the workflow directly.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
