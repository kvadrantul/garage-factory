// Execution List Page

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2, StopCircle, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { executionsApi } from '@/api/client';

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
  pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  waiting_hitl: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
  stopped: { icon: StopCircle, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
};

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const duration = end - start;

  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${(duration / 60000).toFixed(1)}m`;
}

export function ExecutionList() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['executions'],
    queryFn: () => executionsApi.list(),
    refetchInterval: 5000, // Poll every 5s for running executions
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => executionsApi.stop(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['executions'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => executionsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['executions'] }),
  });

  return (
    <main className="p-6">
      <h2 className="text-xl font-semibold text-foreground mb-6">Executions</h2>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No executions yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Execute a workflow to see results here
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Workflow
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Trigger
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Started
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.data.map((execution) => {
                  const config = statusConfig[execution.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  const isRunning = execution.status === 'running' || execution.status === 'waiting_hitl';

                  return (
                    <tr key={execution.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          to={`/executions/${execution.id}`}
                          className="flex items-center gap-2"
                        >
                          <span className={`p-1 rounded ${config.bg}`}>
                            <StatusIcon
                              size={16}
                              className={`${config.color} ${
                                execution.status === 'running' ? 'animate-spin' : ''
                              }`}
                            />
                          </span>
                          <span className="text-sm capitalize text-foreground">{execution.status.replace('_', ' ')}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/executions/${execution.id}`}
                          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {execution.workflowName || 'Unknown'}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground capitalize">
                          {execution.triggerType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">
                          {execution.startedAt
                            ? new Date(execution.startedAt).toLocaleString()
                            : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">
                          {formatDuration(execution.startedAt, execution.finishedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isRunning && (
                            <button
                              onClick={() => stopMutation.mutate(execution.id)}
                              className="p-1.5 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
                              title="Stop"
                            >
                              <StopCircle size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm('Delete this execution?')) {
                                deleteMutation.mutate(execution.id);
                              }
                            }}
                            className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
  );
}
