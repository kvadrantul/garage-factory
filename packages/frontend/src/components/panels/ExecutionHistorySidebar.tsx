// Execution History Sidebar - shows past executions for current workflow

import { useQuery } from '@tanstack/react-query';
import { Clock, CheckCircle, XCircle, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { executionsApi } from '@/api/client';

interface ExecutionHistorySidebarProps {
  workflowId: string;
  currentExecutionId: string | null;
  onSelectExecution: (executionId: string) => void;
}

interface Execution {
  id: string;
  status: string;
  triggerType: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export function ExecutionHistorySidebar({
  workflowId,
  currentExecutionId,
  onSelectExecution,
}: ExecutionHistorySidebarProps) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['executions', workflowId],
    queryFn: () => executionsApi.list({ workflowId, limit: 20 }),
    refetchInterval: currentExecutionId ? 2000 : false, // Poll while running
  });

  const executions = data?.data || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 size={14} className="text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'failed':
        return <XCircle size={14} className="text-red-500" />;
      case 'waiting_hitl':
        return <AlertCircle size={14} className="text-amber-500" />;
      default:
        return <Clock size={14} className="text-muted-foreground" />;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (startedAt: string, finishedAt?: string) => {
    if (!finishedAt) return 'Running...';
    const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="w-64 bg-card border-l border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Execution History</h3>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <Loader2 size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Executions list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && executions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : executions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No executions yet
          </div>
        ) : (
          <div className="divide-y divide-border">
            {executions.map((execution: Execution) => (
              <button
                key={execution.id}
                onClick={() => onSelectExecution(execution.id)}
                className={`w-full p-3 text-left hover:bg-accent/50 transition-colors ${
                  currentExecutionId === execution.id ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(execution.status)}
                    <span className="text-xs text-muted-foreground">
                      {formatTime(execution.startedAt)}
                    </span>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </div>

                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">
                    {execution.triggerType.replace('_', ' ')}
                  </span>
                  <span className={`${
                    execution.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'
                  }`}>
                    {formatDuration(execution.startedAt, execution.finishedAt)}
                  </span>
                </div>

                {execution.error && (
                  <div className="mt-1 text-[10px] text-red-500 truncate" title={execution.error}>
                    {execution.error}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer with total count */}
      {data?.total !== undefined && data.total > 0 && (
        <div className="p-2 border-t border-border text-center">
          <span className="text-xs text-muted-foreground">
            {data.total} total execution{data.total !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
